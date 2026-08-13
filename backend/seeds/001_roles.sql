INSERT INTO roles (name, description)
VALUES
('ADMIN','System administrator'),
('REGISTRAR','Front desk staff'),
('DOCTOR','Clinical doctor'),
('PHARMACIST','Pharmacy staff'),
('FINANCE','Finance reporting')
ON CONFLICT (name) DO NOTHING;
