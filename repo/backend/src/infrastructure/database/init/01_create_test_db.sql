-- Create test database if it doesn't exist (for integration tests)
SELECT 'CREATE DATABASE justiceops_test OWNER justiceops'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'justiceops_test')\gexec
