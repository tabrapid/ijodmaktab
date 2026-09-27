-- Audit jurnali faqat qo'shiladi: yozuvlarni o'zgartirish yoki o'chirish
-- baza darajasida taqiqlanadi (reja, 2-bo'lim: super admin ham audit
-- yozuvlarini odatiy interfeys orqali o'chira olmaydi).
--
-- Eslatma: jadval egasi (migratsiya roli) triggerni o'chira oladi. Productionda
-- ilova alohida, cheklangan huquqli rol bilan ulanishi kerak (docs/deploy.md).
CREATE FUNCTION "audit_event_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent yozuvlarini o''zgartirish yoki o''chirish taqiqlangan';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_no_update"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_immutable"();

CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_event_immutable"();
