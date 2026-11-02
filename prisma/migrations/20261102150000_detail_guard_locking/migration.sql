-- Serialises the approval guard against a concurrent approval.
--
-- 20261102140000_detail_move_guard checked both parents, but a plain SELECT
-- reads the last committed status: an approval committing between the check and
-- the move could still let a line enter or leave a document that became approved
-- in that window.
--
-- Both parent lookups now take FOR SHARE, which conflicts with the row lock an
-- approval holds while it updates document_header. A move therefore waits for an
-- in-flight approval and re-reads the committed status before deciding.
--
-- The transaction-scoped docflow.maintenance override is untouched.

create or replace function docflow.guard_approved_document()
returns trigger
language plpgsql
as $$
begin
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
    if (select status from docflow.document_header where shno = old.shno for share) = 'approved' then
      raise exception 'approved documents are immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- Insert or update: destination must not be approved (row locked for share).
  if (select status from docflow.document_header where shno = new.shno for share) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  -- Re-parenting: the original parent must not be approved either.
  if tg_op = 'UPDATE'
     and new.shno is distinct from old.shno
     and (select status from docflow.document_header where shno = old.shno for share) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
