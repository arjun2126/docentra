-- Closes an approval-integrity gap found during schema verification.
--
-- `update docflow.document_detail set shno = ...` could move a line OUT of an
-- approved document, because the guard only inspected the destination parent
-- (new.shno). An approved document could therefore be emptied one line at a
-- time without touching any guarded header column.
--
-- Both parents are now checked. The transaction-scoped `docflow.maintenance`
-- override is preserved verbatim so the idempotent seeder can still rebuild the
-- demonstration documents it owns.

create or replace function docflow.guard_approved_document()
returns trigger
language plpgsql
as $$
begin
  -- Seeder-only escape hatch: transaction-local, never granted to the app.
  if current_setting('docflow.maintenance', true) = 'on' then
    if tg_table_name = 'document_header' then
      return new;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'document_header' then
    if old.status = 'approved' and (
      new.status <> old.status
      or new.vendor_id is distinct from old.vendor_id
      or new.document_date is distinct from old.document_date
      or new.document_number is distinct from old.document_number
      or new.notes is distinct from old.notes
    ) then
      raise exception 'approved documents are immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if (select status from docflow.document_header where shno = old.shno) = 'approved' then
      raise exception 'approved documents are immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- Insert or update: the destination parent must not be approved.
  if (select status from docflow.document_header where shno = new.shno) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  -- Update that re-parents the line: the original parent must not be approved
  -- either, otherwise the line leaves a frozen document.
  if tg_op = 'UPDATE'
     and new.shno is distinct from old.shno
     and (select status from docflow.document_header where shno = old.shno) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
