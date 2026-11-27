-- Multi-Tenant Database Migration: Add tenant_id & Row-Level Security to All Tables
-- Database: hms_narendran

DO $$
DECLARE
    v_primary_tenant_id uuid;
    v_table_record record;
    v_data_type text;
BEGIN
    -- 1. Ensure master 'tenants' table exists
    CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_code varchar(50) NOT NULL UNIQUE,
        tenant_name varchar(255) NOT NULL,
        database_name varchar(255) NOT NULL UNIQUE,
        status varchar(50) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
        updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
    );

    -- 2. Identify or register the flagship primary tenant (Narendran Hospital)
    SELECT id INTO v_primary_tenant_id 
    FROM tenants 
    WHERE database_name = 'hms_narendran' OR tenant_code = 'T-NARENDRAN' 
    LIMIT 1;

    IF v_primary_tenant_id IS NULL THEN
        -- Check if hospital table has Narendran Hospital
        SELECT id INTO v_primary_tenant_id 
        FROM hospitals 
        WHERE hospital_code = 'HSP-873E54' OR name ILIKE '%narendran%' 
        LIMIT 1;

        IF v_primary_tenant_id IS NULL THEN
            v_primary_tenant_id := '7718145a-20fb-4c27-89eb-8f1bebf1ab28'::uuid;
        END IF;

        INSERT INTO tenants (id, tenant_code, tenant_name, database_name, status)
        VALUES (
            v_primary_tenant_id, 
            'T-NARENDRAN', 
            'Narendran Hospital', 
            'hms_narendran', 
            'ACTIVE'
        )
        ON CONFLICT (tenant_code) DO NOTHING;
    END IF;

    -- Ensure Narendran Hospital is registered in hospital_tenants if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hospital_tenants') THEN
        INSERT INTO hospital_tenants (id, tenant_name, tenant_code, email, phone, address, status)
        VALUES (
            v_primary_tenant_id,
            'Narendran Hospital',
            'T-NARENDRAN',
            'bharathi2004m@gmail.com',
            '9361050733',
            'Chennai Ram Nagar South,Velachery,600042',
            'ACTIVE'
        )
        ON CONFLICT (tenant_code) DO NOTHING;
    END IF;

    -- Ensure other registered tenant references exist in tenants
    INSERT INTO tenants (id, tenant_code, tenant_name, database_name, status)
    VALUES (
        '0dff8b85-2af8-47b2-8574-e92edab8bfee'::uuid,
        'T-ANNAAMALAI',
        'Annaamalai Cancer Center',
        'hms_annaamalai',
        'ACTIVE'
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Primary Tenant ID established: %', v_primary_tenant_id;

    -- 3. Loop through all public domain tables (excluding platform tables)
    FOR v_table_record IN
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN (
              'tenants', 
              'hospital_tenants', 
              'master_admin_users', 
              'tenant_admin_master_login', 
              'pgmigrations',
              'pgmigrations_tenant',
              'spatial_ref_sys'
          )
        ORDER BY table_name
    LOOP
        -- Check if tenant_id column already exists and get its data type
        SELECT data_type INTO v_data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = v_table_record.table_name 
          AND column_name = 'tenant_id';

        IF v_data_type IS NULL THEN
            -- Column does not exist, add it
            EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id UUID', v_table_record.table_name);
        ELSIF v_data_type IN ('character varying', 'text') THEN
            -- Column exists as varchar/text (e.g. attendance tables with 'default')
            -- Clean and backfill any invalid UUID or 'default' values first
            EXECUTE format('
                UPDATE %I 
                SET tenant_id = %L 
                WHERE tenant_id IS NULL 
                   OR tenant_id = ''default'' 
                   OR tenant_id = '''' 
                   OR tenant_id !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''',
                v_table_record.table_name,
                v_primary_tenant_id::text
            );
            -- Drop existing default if any
            EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', v_table_record.table_name);
            -- Alter column type to UUID
            EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id TYPE UUID USING (tenant_id::uuid)', v_table_record.table_name);
        END IF;

        -- Backfill any remaining null rows with primary tenant ID
        EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', v_table_record.table_name, v_primary_tenant_id::text);

        -- Set smart session-aware default value: app.current_tenant_id or fallback to primary tenant
        EXECUTE format('
            ALTER TABLE %I 
            ALTER COLUMN tenant_id 
            SET DEFAULT COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid', 
            v_table_record.table_name, 
            v_primary_tenant_id::text
        );

        -- Make tenant_id NOT NULL
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', v_table_record.table_name);

        -- Create index for tenant_id
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', 'idx_' || v_table_record.table_name || '_tenant_id', v_table_record.table_name);

        -- Enable and Force Row-Level Security
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table_record.table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_table_record.table_name);

        -- Apply Tenant Isolation Policy
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', v_table_record.table_name);
        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON %I
            AS PERMISSIVE FOR ALL
            USING (
                tenant_id = COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid
                OR current_setting(''app.is_master_admin'', true) = ''true''
            )
            WITH CHECK (
                tenant_id = COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid
                OR current_setting(''app.is_master_admin'', true) = ''true''
            )', 
            v_table_record.table_name, 
            v_primary_tenant_id::text, 
            v_primary_tenant_id::text
        );

        RAISE NOTICE 'Configured tenant_id and RLS on table: %', v_table_record.table_name;
    END LOOP;
END;
$$;

-- Event Trigger to automatically configure tenant_id and RLS on any FUTURE table
CREATE OR REPLACE FUNCTION enforce_tenant_isolation_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
    obj record;
    tbl_name text;
    col_exists boolean;
    is_exempt boolean;
    v_primary_tenant_id text;
BEGIN
    SELECT id::text INTO v_primary_tenant_id 
    FROM tenants 
    WHERE database_name = 'hms_narendran' OR tenant_code = 'T-NARENDRAN' 
    LIMIT 1;

    IF v_primary_tenant_id IS NULL THEN
        v_primary_tenant_id := '7718145a-20fb-4c27-89eb-8f1bebf1ab28';
    END IF;

    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
    LOOP
        tbl_name := split_part(obj.object_identity, '.', 2);
        IF tbl_name IS NULL OR tbl_name = '' THEN
            tbl_name := obj.object_identity;
        END IF;

        is_exempt := tbl_name IN (
            'tenants', 
            'hospital_tenants', 
            'master_admin_users', 
            'tenant_admin_master_login', 
            'pgmigrations',
            'pgmigrations_tenant',
            'spatial_ref_sys'
        );

        IF NOT is_exempt THEN
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = tbl_name 
                  AND column_name = 'tenant_id'
            ) INTO col_exists;

            IF NOT col_exists THEN
                EXECUTE format('
                    ALTER TABLE %I 
                    ADD COLUMN tenant_id UUID NOT NULL 
                    DEFAULT COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid', 
                    tbl_name, v_primary_tenant_id);

                EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', 'idx_' || tbl_name || '_tenant_id', tbl_name);
            END IF;

            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name);

            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl_name);
            EXECUTE format('
                CREATE POLICY tenant_isolation_policy ON %I
                AS PERMISSIVE FOR ALL
                USING (
                    tenant_id = COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid
                    OR current_setting(''app.is_master_admin'', true) = ''true''
                )
                WITH CHECK (
                    tenant_id = COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), %L)::uuid
                    OR current_setting(''app.is_master_admin'', true) = ''true''
                )', tbl_name, v_primary_tenant_id, v_primary_tenant_id);
        END IF;
    END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_enforce_tenant_isolation;
CREATE EVENT TRIGGER trg_enforce_tenant_isolation
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION enforce_tenant_isolation_on_new_table();

