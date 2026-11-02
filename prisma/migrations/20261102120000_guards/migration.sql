-- Approved documents are frozen at the database layer, not only in the app.
-- Application checks are the friendly path; these guards are the guarantee.

create or replace function docflow.guard_approved_document()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'document_header' then
    if old.status = 'approved' and (
      new.vendor_id is distinct from old.vendor_id
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

drop trigger if exists document_header_immutable on docflow.document_header;
create trigger document_header_immutable
  before update on docflow.document_header
  for each row execute function docflow.guard_approved_document();

drop trigger if exists document_detail_immutable on docflow.document_detail;
create trigger document_detail_immutable
  before insert or update or delete on docflow.document_detail
  for each row execute function docflow.guard_approved_document();

-- Search and reporting access paths (M4 relies on these).
create index if not exists document_header_number_lower_idx
  on docflow.document_header (lower(document_number));
create index if not exists vendor_name_lower_idx
  on docflow.vendor (lower(name));
create index if not exists document_detail_item_lower_idx
  on docflow.document_detail (lower(item));
create index if not exists document_header_date_idx
  on docflow.document_header (document_date desc);
