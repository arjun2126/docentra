-- Replaces FOR SHARE with FOR NO KEY UPDATE in the approval guard.
--
-- FOR SHARE is compatible with itself, so two concurrent detail edits to the same
-- draft could each hold it and then both need to update the header (via the totals
-- trigger), upgrading to conflicting locks: a deadlock.
--
-- FOR NO KEY UPDATE conflicts immediately, so the second writer waits at the guard
-- without holding a lock the first needs. It still conflicts with the lock an
-- approval takes, so a move cannot commit between the status check and the write.
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
    if (select status from docflow.document_header where shno = old.shno for no key update) = 'approved' then
      raise exception 'approved documents are immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if (select status from docflow.document_header where shno = new.shno for no key update) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.shno is distinct from old.shno
     and (select status from docflow.document_header where shno = old.shno for no key update) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
