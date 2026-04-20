ALTER TABLE invoice
ADD COLUMN IF NOT EXISTS site_assessment_image TEXT[];
