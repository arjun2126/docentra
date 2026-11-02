-- DocFlow initial schema.
-- Constraints and the totals trigger live here because Prisma cannot express
-- them: they are the invariants the integration tests assert.

CREATE SCHEMA IF NOT EXISTS docflow;

CREATE TABLE docflow.vendor (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  email      text,
  phone      text,
  address    text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE docflow.document_header (
  shno            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_number text NOT NULL UNIQUE,
  document_date   date NOT NULL,
  vendor_id       bigint NOT NULL REFERENCES docflow.vendor(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  total_amount    numeric(16,2) NOT NULL DEFAULT 0,
  line_count      integer NOT NULL DEFAULT 0,
  notes           text,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE docflow.document_detail (
  detail_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shno      bigint NOT NULL REFERENCES docflow.document_header(shno) ON DELETE CASCADE,
  line_no   integer NOT NULL,
  item      text NOT NULL,
  quantity  numeric(14,4) NOT NULL CHECK (quantity > 0),
  price     numeric(14,2) NOT NULL CHECK (price >= 0),
  amount    numeric(16,2) NOT NULL,
  CONSTRAINT uq_detail_line UNIQUE (shno, line_no),
  CONSTRAINT ck_detail_amount CHECK (amount = round(quantity * price, 2))
);

CREATE INDEX ix_header_vendor_date ON docflow.document_header (vendor_id, document_date);
CREATE INDEX ix_header_status      ON docflow.document_header (status);
CREATE INDEX ix_detail_shno        ON docflow.document_detail (shno);

-- Header totals are derived, never hand-entered. Recomputing them in the
-- database means seeds, imports and application code cannot drift apart.
CREATE OR REPLACE FUNCTION docflow.recalc_header_totals(p_shno bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE docflow.document_header h
     SET total_amount = COALESCE(
           (SELECT sum(d.amount) FROM docflow.document_detail d WHERE d.shno = p_shno), 0),
         line_count = (
           SELECT count(*) FROM docflow.document_detail d WHERE d.shno = p_shno),
         updated_at = now()
   WHERE h.shno = p_shno;
END;
$$;

CREATE OR REPLACE FUNCTION docflow.document_detail_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM docflow.recalc_header_totals(OLD.shno);
    RETURN OLD;
  END IF;

  -- Moving a line between documents must fix both sides.
  IF TG_OP = 'UPDATE' AND NEW.shno <> OLD.shno THEN
    PERFORM docflow.recalc_header_totals(OLD.shno);
  END IF;

  PERFORM docflow.recalc_header_totals(NEW.shno);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_document_detail_totals
AFTER INSERT OR UPDATE OR DELETE ON docflow.document_detail
FOR EACH ROW EXECUTE FUNCTION docflow.document_detail_totals();
