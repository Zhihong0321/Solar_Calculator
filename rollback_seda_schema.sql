-- ============================================================
-- ROLLBACK SCRIPT - Remove all changes from seda_registration
-- This will restore the table to its original state (99 columns)
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: DROP ALL INDEXES WE CREATED
-- ============================================================

DROP INDEX IF EXISTS idx_seda_mapper_status;
DROP INDEX IF EXISTS idx_seda_seda_status;
DROP INDEX IF EXISTS idx_seda_redex_status;
DROP INDEX IF EXISTS idx_seda_agent;
DROP INDEX IF EXISTS idx_seda_created_by;
DROP INDEX IF EXISTS idx_seda_linked_customer;
DROP INDEX IF EXISTS idx_seda_created_at;
DROP INDEX IF EXISTS idx_seda_updated_at;
DROP INDEX IF EXISTS idx_seda_last_synced_at;
DROP INDEX IF EXISTS idx_seda_state;
DROP INDEX IF EXISTS idx_seda_city;
DROP INDEX IF EXISTS idx_seda_status_agent;
DROP INDEX IF EXISTS idx_seda_status_created;
DROP INDEX IF EXISTS idx_seda_linked_invoice_gin;

-- ============================================================
-- SECTION 2: DROP ALL NEW COLUMNS WE ADDED
-- ============================================================

-- Customer Information
ALTER TABLE seda_registration DROP COLUMN IF EXISTS applicant_name;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS applicant_ic;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS applicant_phone;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS applicant_email;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS alternate_contact_no;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS alternate_email;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS preferred_contact_method;

-- Property Details
ALTER TABLE seda_registration DROP COLUMN IF EXISTS property_type;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS property_area_sqft;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS roof_type;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS roof_area_sqft;

-- System Specifications
ALTER TABLE seda_registration DROP COLUMN IF EXISTS panel_brand;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS panel_model;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS panel_count;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS panel_wattage;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS inverter_brand;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS inverter_model;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS inverter_count;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS mounting_structure;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS solar_panel_type;

-- Financial Details
ALTER TABLE seda_registration DROP COLUMN IF EXISTS down_payment;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS monthly_installment;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS cash_price;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS loan_amount;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS interest_rate;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS loan_tenure_months;

-- Installation & Timeline
ALTER TABLE seda_registration DROP COLUMN IF EXISTS installation_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS commissioning_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS grid_connection_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS expected_completion_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS actual_completion_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS delay_reason;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS extension_requested;

-- Verification & Approval
ALTER TABLE seda_registration DROP COLUMN IF EXISTS verified_by;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS verified_at;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS approved_by;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS approved_at;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS rejected_at;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS ic_verified;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS bill_verified;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS ownership_verified;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS site_audit_required;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS site_audit_completed;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS site_audit_report;

-- Technical Assessment
ALTER TABLE seda_registration DROP COLUMN IF EXISTS shading_analysis;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS structural_assessment;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS electrical_assessment;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS energy_consumption_kwh;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS proposed_system_size_kwp;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS estimated_annual_generation_kwh;

-- Grid Connection
ALTER TABLE seda_registration DROP COLUMN IF EXISTS grid_connection_type;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS meter_type;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS ct_vt_ratio;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS protection_device;

-- Compliance & Permits
ALTER TABLE seda_registration DROP COLUMN IF EXISTS building_permit_required;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS building_permit_no;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS environmental_clearance;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS heritage_site_clearance;

-- Project Management
ALTER TABLE seda_registration DROP COLUMN IF EXISTS project_manager;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS site_supervisor;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS electrician_in_charge;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS safety_officer;

-- Quality Assurance
ALTER TABLE seda_registration DROP COLUMN IF EXISTS qa_checklist;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS qa_inspector;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS qa_inspection_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS qa_status;

-- Maintenance & Warranty
ALTER TABLE seda_registration DROP COLUMN IF EXISTS maintenance_plan;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS warranty_period_years;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS warranty_start_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS warranty_end_date;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS monitoring_system_installed;

-- Communication Preferences
ALTER TABLE seda_registration DROP COLUMN IF EXISTS sms_notifications_enabled;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS email_notifications_enabled;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS whatsapp_notifications_enabled;

-- Risk Assessment
ALTER TABLE seda_registration DROP COLUMN IF EXISTS risk_level;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS risk_factors;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS mitigation_measures;

-- Audit Trail
ALTER TABLE seda_registration DROP COLUMN IF EXISTS last_modified_by;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS import_batch_id;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS data_source;

-- Metadata
ALTER TABLE seda_registration DROP COLUMN IF EXISTS tags;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS notes;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS internal_remarks;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS customer_segment;

-- Performance Tracking
ALTER TABLE seda_registration DROP COLUMN IF EXISTS performance_ratio;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS capacity_factor;

-- Insurance
ALTER TABLE seda_registration DROP COLUMN IF EXISTS insurance_provider;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS insurance_policy_no;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS insurance_coverage_amount;
ALTER TABLE seda_registration DROP COLUMN IF EXISTS insurance_expiry_date;

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Count remaining columns (should be back to 99)
SELECT COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'seda_registration';

-- Count remaining indexes (should be back to 4)
SELECT COUNT(*) as index_count 
FROM pg_indexes 
WHERE tablename = 'seda_registration';
