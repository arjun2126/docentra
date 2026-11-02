-- Removes the last deadlock path in the approval guard: lock ordering.
--
-- A re-parenting update locked new.shno and then old.shno. Two concurrent moves in
-- opposite directions (A -> B and B -> A) could therefore each hold one parent and
-- wait for the other. Parents are now locked in ascending shno order in a single
-- statement, so opposing moves queue on the same first row instead of cycling.
--
-- FOR NO KEY UPDATE still conflicts with an approval's update lock, so a move
-- cannot commit between the status check and the write. The transaction-scoped
-- docflow.maintenance override is untouched.

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

  -- Lock every parent this row depends on, always in ascending shno order.
  if tg_op = 'DELETE' then
    perform 1 from docflow.document_header
      where shno = old.shno
      order by shno
      for no key update;
  elsif tg_op = 'UPDATE' and new.shno is distinct from old.shno then
    perform 1 from docflow.document_header
      where shno in (new.shno, old.shno)
      order by shno
      for no key update;
  else
    perform 1 from docflow.document_header
      where shno = new.shno
      order by shno
      for no key update;
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

  if tg_op = 'UPDATE' and new.shno is distinct from old.shno
     and (select status from docflow.document_header where shno = old.shno) = 'approved' then
    raise exception 'approved documents are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
