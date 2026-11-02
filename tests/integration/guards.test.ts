// Approval immutability at the database layer, with emphasis on line
// re-parenting. A line must not be able to enter OR leave a frozen document,
// while ordinary draft work keeps working.
import { beforeAll, describe, expect, it } from "vitest";

import pg from "pg";

import {
  insertDocument,
  insertVendor,
  resetSchema,
  TEST_DATABASE_URL,
  withClient,
} from "./reset-schema";

let vendorId = "";

async function waitForBlock(client: pg.Client, blockedPid: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const { rows } = await client.query("select cardinality(pg_blocking_pids($1)) > 0 as blocked", [blockedPid]);
    if (rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected database lock wait was not observed");
}

beforeAll(async () => {
  await resetSchema();
  await withClient(async (client) => {
    vendorId = await insertVendor(client, "V-300", "Guard Supply");
  });
});

type Line = { item: string; quantity: string; price: string };

async function makeDocument(options: {
  number: string;
  status?: string;
  lines?: Line[];
}): Promise<string> {
  let shno = "";
  await withClient(async (client) => {
    shno = await insertDocument(client, {
      number: options.number,
      date: "2026-04-01",
      vendorId,
      status: options.status ?? "draft",
      items: options.lines ?? [{ item: "Cable", quantity: "2", price: "5.00" }],
    });
  });
  return shno;
}

async function totals(shno: string): Promise<{ total: string; lines: number }> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      "select total_amount::text as total, line_count from docflow.document_header where shno = $1",
      [shno],
    );
    return { total: rows[0].total, lines: rows[0].line_count };
  });
}

describe("approved documents are frozen", () => {
  it("rejects editing an existing line", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800141", status: "approved" });
    await expect(withClient((client) => client.query(
      "update docflow.document_detail set quantity = 4, amount = 20 where shno = $1", [shno],
    ))).rejects.toMatchObject({ code: "23514" });
    expect(await totals(shno)).toEqual({ total: "10.00", lines: 1 });
  });
  it("rejects header edits", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800101", status: "approved" });
    await expect(
      withClient((client) =>
        client.query("update docflow.document_header set notes = 'changed' where shno = $1", [shno]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("rejects reopening with a bare status update", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800111", status: "approved" });
    await expect(
      withClient((client) =>
        client.query("update docflow.document_header set status = 'draft' where shno = $1", [shno]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("rejects inserting a new line", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800121", status: "approved" });
    await expect(
      withClient((client) =>
        client.query(
          `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
           values ($1, 9, 'Extra', 1, 1, 1)`,
          [shno],
        ),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("rejects deleting an existing line", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800131", status: "approved" });
    await expect(
      withClient((client) =>
        client.query("delete from docflow.document_detail where shno = $1", [shno]),
      ),
    ).rejects.toThrow(/immutable/i);
    expect(await totals(shno)).toEqual({ total: "10.00", lines: 1 });
  });
});

describe("a line cannot cross an approval boundary", () => {
  it("rejects moving a line INTO an approved document", async () => {
    const approved = await makeDocument({ number: "DOC-2026-800201", status: "approved" });
    const draft = await makeDocument({ number: "DOC-2026-800202" });

    await expect(
      withClient((client) =>
        client.query(
          "update docflow.document_detail set shno = $1, line_no = 5 where shno = $2",
          [approved, draft],
        ),
      ),
    ).rejects.toThrow(/immutable/i);

    expect(await totals(approved)).toEqual({ total: "10.00", lines: 1 });
    expect(await totals(draft)).toEqual({ total: "10.00", lines: 1 });
  });

  it("rejects moving a line OUT of an approved document", async () => {
    const approved = await makeDocument({ number: "DOC-2026-800211", status: "approved" });
    const empty = await makeDocument({ number: "DOC-2026-800212", lines: [] });

    // The defect: the guard used to inspect only the destination parent, so this
    // succeeded and quietly emptied a frozen document.
    await expect(
      withClient((client) =>
        client.query("update docflow.document_detail set shno = $1 where shno = $2", [
          empty,
          approved,
        ]),
      ),
    ).rejects.toThrow(/immutable/i);

    expect(await totals(approved)).toEqual({ total: "10.00", lines: 1 });
    expect(await totals(empty)).toEqual({ total: "0.00", lines: 0 });
  });
});

describe("draft work is unaffected", () => {
  it("rejects moving a line between two drafts without changing either total", async () => {
    const from = await makeDocument({
      number: "DOC-2026-800301",
      lines: [
        { item: "A", quantity: "1", price: "10.00" },
        { item: "B", quantity: "1", price: "5.00" },
      ],
    });
    const to = await makeDocument({
      number: "DOC-2026-800302",
      lines: [{ item: "C", quantity: "1", price: "7.00" }],
    });

    await expect(withClient((client) =>
      client.query(
        "update docflow.document_detail set shno = $1, line_no = 2 where shno = $2 and line_no = 2",
        [to, from],
      ),
    )).rejects.toMatchObject({ code: "23514" });

    expect(await totals(from)).toEqual({ total: "15.00", lines: 2 });
    expect(await totals(to)).toEqual({ total: "7.00", lines: 1 });
  });

  it("allows editing a draft header and its lines", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800311" });
    await withClient((client) =>
      client.query("update docflow.document_header set notes = 'revised' where shno = $1", [shno]),
    );
    const notes = await withClient(async (client) => {
      const { rows } = await client.query(
        "select notes from docflow.document_header where shno = $1",
        [shno],
      );
      return rows[0].notes;
    });
    expect(notes).toBe("revised");
    await withClient(async (client) => {
      await client.query("update docflow.document_detail set shno = shno, quantity = 3, amount = 15 where shno = $1", [shno]);
      await client.query("insert into docflow.document_detail (shno, line_no, item, quantity, price, amount) values ($1, 2, 'New', 1, 4, 4)", [shno]);
    });
    expect(await totals(shno)).toEqual({ total: "19.00", lines: 2 });
    await withClient((client) => client.query("delete from docflow.document_detail where shno = $1 and line_no = 1", [shno]));
    expect(await totals(shno)).toEqual({ total: "4.00", lines: 1 });
  });
});

describe("the maintenance override stays transaction-scoped", () => {
  it("lets the seeder rebuild an approved document inside its own transaction", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800401", status: "approved" });

    await withClient(async (client) => {
      await client.query("begin");
      await client.query("select set_config('docflow.maintenance', 'on', true)");

      await client.query("update docflow.document_header set notes = 'seeded' where shno = $1", [
        shno,
      ]);
      const header = await client.query(
        "select notes from docflow.document_header where shno = $1",
        [shno],
      );
      expect(header.rows[0].notes).toBe("seeded");

      await client.query(
        "update docflow.document_detail set quantity = 4, amount = 20.00 where shno = $1",
        [shno],
      );
      const totalsRow = await client.query(
        "select total_amount::text as total from docflow.document_header where shno = $1",
        [shno],
      );
      expect(totalsRow.rows[0].total).toBe("20.00");

      await client.query("rollback");
    });
  });

  it("expires on the same connection after the transaction is rolled back", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800411", status: "approved" });
    await withClient(async (client) => {
      await client.query("begin");
      await client.query("select set_config('docflow.maintenance', 'on', true)");
      await client.query("update docflow.document_header set notes = 'seeded' where shno = $1", [
        shno,
      ]);
      await client.query("rollback");

      // Same session, same connection: a session-scoped setting would survive
      // this point, so this is what proves the override is transaction-local.
      await expect(
        client.query("update docflow.document_header set notes = 'after' where shno = $1", [shno]),
      ).rejects.toThrow(/immutable/i);
    });
  });

  it("expires on the same connection after the transaction commits", async () => {
    const shno = await makeDocument({ number: "DOC-2026-800421", status: "approved" });
    await withClient(async (client) => {
      await client.query("begin");
      await client.query("select set_config('docflow.maintenance', 'on', true)");
      await client.query("update docflow.document_header set notes = 'seeded' where shno = $1", [
        shno,
      ]);
      await client.query("commit");

      await expect(
        client.query("update docflow.document_header set notes = 'after' where shno = $1", [shno]),
      ).rejects.toThrow(/immutable/i);
    });
  });
});

describe("concurrent approval cannot race a line edit", () => {
  it("waits for an in-flight approval and then refuses the edit", async () => {
    const target = await makeDocument({ number: "DOC-2026-800501" });

    const approver = new pg.Client({ connectionString: TEST_DATABASE_URL });
    const mover = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await approver.connect();
    await mover.connect();
    try {
      await mover.query("set statement_timeout = '5s'");
      const pid = (await mover.query("select pg_backend_pid() as pid")).rows[0].pid;
      await approver.query("begin");
      await approver.query(
        "update docflow.document_header set status = 'approved' where shno = $1",
        [target],
      );

      let settled = false;
      const move = mover
        .query("update docflow.document_detail set item = 'racing edit' where shno = $1", [target])
        .then(
          () => {
            settled = true;
            return null;
          },
          (error: Error) => {
            settled = true;
            return error;
          },
        );

      await waitForBlock(approver, pid);
      // Still blocked on the parent's FOR NO KEY UPDATE lock.
      expect(settled).toBe(false);

      await approver.query("commit");

      const error = await move;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toMatch(/immutable/i);
    } finally {
      await approver.query("rollback");
      await approver.end();
      await mover.end();
    }
  });
});

describe("permanent ownership and lock ordering", () => {
  it.each(["submitted", "rejected", "approved"])("rejects re-parenting a %s line to another approved document", async (status) => {
    const suffix = status === "submitted" ? "31" : status === "rejected" ? "32" : "33";
    const from = await makeDocument({ number: `DOC-2026-8010${suffix}`, status });
    const to = await makeDocument({ number: `DOC-2026-8020${suffix}`, status: "approved", lines: [] });
    await expect(withClient((client) => client.query(
      "update docflow.document_detail set shno = $1 where shno = $2", [to, from],
    ))).rejects.toMatchObject({ code: "23514" });
    expect(await totals(from)).toEqual({ total: "10.00", lines: 1 });
    expect(await totals(to)).toEqual({ total: "0.00", lines: 0 });
  });
  it("rejects transfers even under maintenance and without waiting on either header", async () => {
    const from = await makeDocument({ number: "DOC-2026-800701" });
    const to = await makeDocument({ number: "DOC-2026-800702" });
    await withClient(async (holder) => {
      await holder.query("begin");
      try {
        await holder.query("select shno from docflow.document_header where shno in ($1, $2) order by shno for no key update", [from, to]);
        await withClient(async (writer) => {
          await writer.query("begin");
          await writer.query("set local lock_timeout = '500ms'");
          await writer.query("select set_config('docflow.maintenance', 'on', true)");
          await expect(writer.query("update docflow.document_detail set shno = $1 where shno = $2", [to, from]))
            .rejects.toMatchObject({ code: "23514" });
          await writer.query("rollback");
        });
      } finally {
        await holder.query("rollback");
      }
    });
    expect(await totals(from)).toEqual({ total: "10.00", lines: 1 });
    expect(await totals(to)).toEqual({ total: "10.00", lines: 1 });
  });

  it.each(["edit", "approval"])("queues a header-first %s behind an editor and retains exact totals", async (operation) => {
    const shno = await makeDocument({ number: operation === "edit" ? "DOC-2026-800711" : "DOC-2026-800712" });
    await withClient(async (a) => withClient(async (b) => {
      await a.query("begin");
      await b.query("begin");
      await b.query("set local statement_timeout = '5s'");
      const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
      try {
        await a.query("select shno from docflow.document_header where shno = $1 for no key update", [shno]);
        await a.query("update docflow.document_detail set quantity = 3, amount = 15 where shno = $1", [shno]);
        const pending = b.query(operation === "edit"
          ? "update docflow.document_header set notes = 'editor B' where shno = $1"
          : "update docflow.document_header set status = 'approved' where shno = $1", [shno]).then(() => null, (error: Error) => error);
        await waitForBlock(a, pid);
        await a.query("commit");
        expect(await pending).toBeNull();
        if (operation === "edit") {
          // Same header -> details ordering as updateDocument's replacement.
          await b.query("delete from docflow.document_detail where shno = $1", [shno]);
          await b.query("insert into docflow.document_detail (shno, line_no, item, quantity, price, amount) values ($1, 1, 'Replacement', 1, 7, 7)", [shno]);
        }
        await b.query("commit");
      } finally {
        await a.query("rollback");
        await b.query("rollback");
      }
    }));
    expect(await totals(shno)).toEqual({ total: operation === "edit" ? "7.00" : "15.00", lines: 1 });
  });
});

describe("concurrent edits to the same draft", () => {
  it("serialise instead of deadlocking", async () => {
    const shno = await makeDocument({
      number: "DOC-2026-800601",
      lines: [
        { item: "One", quantity: "1", price: "1.00" },
        { item: "Two", quantity: "1", price: "2.00" },
      ],
    });

    const a = new pg.Client({ connectionString: TEST_DATABASE_URL });
    const b = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await a.connect();
    await b.connect();
    try {
      await a.query("begin");
      await a.query(
        "update docflow.document_detail set item = 'One edited' where shno = $1 and line_no = 1",
        [shno],
      );

      await b.query("begin");
      const pending = b.query(
        "update docflow.document_detail set item = 'Two edited' where shno = $1 and line_no = 2",
        [shno],
      );

      // The second writer queues on the header lock; it must not deadlock.
      await a.query("commit");
      await pending;
      await b.query("commit");

      const items = await withClient(async (client) => {
        const result = await client.query(
          "select item from docflow.document_detail where shno = $1 order by line_no",
          [shno],
        );
        return result.rows.map((row) => row.item);
      });
      expect(items).toEqual(["One edited", "Two edited"]);
    } finally {
      await a.end();
      await b.end();
    }
  });
});
