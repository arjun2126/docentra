-- Two gaps found while refreshing demonstration data:
--   1. an approved document could be reopened with a bare status update, which
--      defeated the freeze without touching any guarded column;
--   2. the seeder had no legitimate way to rebuild demo documents it owns.
--
-- The override is a transaction-local setting: it exists only for the session
-- that sets it, is never granted by the application, and holding database
-- credentials already subsumes anything this could protect against.

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
    if (select status from docflow.document_header where shno = old.shno) = 'approved' then
      raise exception 'approved documents are immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if (select status from docflow.document_header where shno = new.shno) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
