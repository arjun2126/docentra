-- Runs once, on first initialisation of the volume.
-- The test database is a separate database, not a separate cluster, so tests can
-- drop and recreate the docflow schema without touching development data.
CREATE DATABASE docentra_test OWNER docentra;
