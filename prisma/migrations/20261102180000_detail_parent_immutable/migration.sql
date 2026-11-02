-- A detail belongs permanently to its original document. Reject transfers
-- before taking any parent lock, including during maintenance.
create or replace function docflow.guard_approved_document()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
begin
  if tg_table_name = 'document_detail' and tg_op = 'UPDATE' then
    if new.shno is distinct from old.shno then
      raise exception 'document detail parent is immutable'
        using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'document_header' then
    if current_setting('docflow.maintenance', true) = 'on' then
      return new;
    end if;
    if old.status = 'approved' and (
      new.status is distinct from old.status
      or new.vendor_id is distinct from old.vendor_id
      or new.document_date is distinct from old.document_date
      or new.document_number is distinct from old.document_number
      or new.notes is distinct from old.notes
    ) then
      raise exception 'approved documents are immutable' using errcode = '23514';
    end if;
    return new;
  end if;

  -- One parent only. Match the header UPDATE lock used by edits, approvals
  -- and totals; unlike FOR SHARE this never needs a lock upgrade.
  -- Writers must lock the header before touching existing detail rows (the
  -- application and seeder already do). A row trigger cannot order locks that
  -- PostgreSQL has already taken on the target detail tuple.
  if tg_op = 'DELETE' then
    select status into parent_status from docflow.document_header
      where shno = old.shno for no key update;
  else
    select status into parent_status from docflow.document_header
      where shno = new.shno for no key update;
  end if;

  if parent_status = 'approved'
     and current_setting('docflow.maintenance', true) is distinct from 'on' then
    raise exception 'approved documents are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Transfers are forbidden, so totals only ever affect one document.
create or replace function docflow.document_detail_totals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform docflow.recalc_header_totals(old.shno);
    return old;
  end if;
  perform docflow.recalc_header_totals(new.shno);
  return new;
end;
$$;
