-- Lock specialization values to a fixed, locale-independent set of keys.
-- Maps all en/ru/uz seed labels to canonical SCREAMING_SNAKE_CASE keys, then
-- nulls out anything that didn't match (the user-chosen "map only, drop
-- unmapped" policy). Drops the now-unused specializations lookup table.

CREATE TEMP TABLE _spec_map (label text PRIMARY KEY, key text NOT NULL) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO _spec_map (label, key) VALUES
	-- EN seed
	(lower('Demolition Specialist'), 'DEMOLITION'),
	(lower('Site Foreman'), 'FOREMAN'),
	(lower('Mason / Installer'), 'MASON'),
	(lower('Plasterer'), 'PLASTERER'),
	(lower('HVAC Installer'), 'HVAC'),
	(lower('Plumber'), 'PLUMBER'),
	(lower('Electrician'), 'ELECTRICIAN'),
	(lower('Screed Layer'), 'SCREED'),
	(lower('Drywall Installer'), 'DRYWALL'),
	(lower('Door Installer'), 'DOOR_INSTALLER'),
	(lower('Painter'), 'PAINTER'),
	(lower('Tiler'), 'TILER'),
	(lower('Floor Installer'), 'FLOORING'),
	(lower('Cleaning Contractor'), 'CLEANING'),
	-- RU seed
	(lower('Демонтажник'), 'DEMOLITION'),
	(lower('Прораб'), 'FOREMAN'),
	(lower('Каменщик / Монтажник'), 'MASON'),
	(lower('Штукатур'), 'PLASTERER'),
	(lower('Монтажник кондиционеров'), 'HVAC'),
	(lower('Монтажник ОВК'), 'HVAC'),
	(lower('Сантехник'), 'PLUMBER'),
	(lower('Электрик'), 'ELECTRICIAN'),
	(lower('Стяжечник'), 'SCREED'),
	(lower('Монтажник ГКЛ'), 'DRYWALL'),
	(lower('Установщик дверей'), 'DOOR_INSTALLER'),
	(lower('Маляр'), 'PAINTER'),
	(lower('Плиточник'), 'TILER'),
	(lower('Укладчик напольных покрытий'), 'FLOORING'),
	(lower('Укладчик пола'), 'FLOORING'),
	(lower('Клининговая компания'), 'CLEANING'),
	-- UZ seed
	(lower('Demontajchi'), 'DEMOLITION'),
	(lower('Brigadir'), 'FOREMAN'),
	(lower('Obyekt boshlig''i'), 'FOREMAN'),
	(lower('G''isht teruvchi / Montajchi'), 'MASON'),
	(lower('Suvoqchi'), 'PLASTERER'),
	(lower('Konditsioner montajchisi'), 'HVAC'),
	(lower('Ventilyatsiya montajchisi'), 'HVAC'),
	(lower('Santexnik'), 'PLUMBER'),
	(lower('Elektrik'), 'ELECTRICIAN'),
	(lower('Elektrchi'), 'ELECTRICIAN'),
	(lower('Stayjka quyuvchi'), 'SCREED'),
	(lower('Pol stsehkachisi'), 'SCREED'),
	(lower('GKL montajchisi'), 'DRYWALL'),
	(lower('Gipskarton montajchisi'), 'DRYWALL'),
	(lower('Eshik o''rnatuvchi'), 'DOOR_INSTALLER'),
	(lower('Bo''yoqchi'), 'PAINTER'),
	(lower('Plitkachi'), 'TILER'),
	(lower('Koshinchi'), 'TILER'),
	(lower('Pol qoplovchi'), 'FLOORING'),
	(lower('Buzg''uvchi mutaxassis'), 'DEMOLITION'),
	(lower('Tozalash xizmati'), 'CLEANING'),
	-- Canonical keys map to themselves (idempotent re-runs)
	('demolition', 'DEMOLITION'),
	('foreman', 'FOREMAN'),
	('mason', 'MASON'),
	('plasterer', 'PLASTERER'),
	('hvac', 'HVAC'),
	('plumber', 'PLUMBER'),
	('electrician', 'ELECTRICIAN'),
	('screed', 'SCREED'),
	('drywall', 'DRYWALL'),
	('door_installer', 'DOOR_INSTALLER'),
	('painter', 'PAINTER'),
	('tiler', 'TILER'),
	('flooring', 'FLOORING'),
	('cleaning', 'CLEANING')
ON CONFLICT (label) DO NOTHING;
--> statement-breakpoint
UPDATE "sub_stages" ss
SET "specialization" = m.key
FROM _spec_map m
WHERE ss."specialization" IS NOT NULL
	AND lower(ss."specialization") = m.label;
--> statement-breakpoint
UPDATE "sub_stages"
SET "specialization" = NULL
WHERE "specialization" IS NOT NULL
	AND "specialization" NOT IN ('DEMOLITION','FOREMAN','MASON','PLASTERER','HVAC','PLUMBER','ELECTRICIAN','SCREED','DRYWALL','DOOR_INSTALLER','PAINTER','TILER','FLOORING','CLEANING');
--> statement-breakpoint
UPDATE "sub_stage_instances" ssi
SET "specialization" = m.key
FROM _spec_map m
WHERE ssi."specialization" IS NOT NULL
	AND lower(ssi."specialization") = m.label;
--> statement-breakpoint
UPDATE "sub_stage_instances"
SET "specialization" = NULL
WHERE "specialization" IS NOT NULL
	AND "specialization" NOT IN ('DEMOLITION','FOREMAN','MASON','PLASTERER','HVAC','PLUMBER','ELECTRICIAN','SCREED','DRYWALL','DOOR_INSTALLER','PAINTER','TILER','FLOORING','CLEANING');
--> statement-breakpoint
UPDATE "master_profiles" mp
SET "specializations" = COALESCE(mapped.arr, ARRAY[]::text[])
FROM (
	SELECT
		mp2.id,
		ARRAY(
			SELECT DISTINCT m.key
			FROM unnest(mp2."specializations") AS s(val)
			JOIN _spec_map m ON m.label = lower(s.val)
		) AS arr
	FROM "master_profiles" mp2
) AS mapped
WHERE mp.id = mapped.id;
--> statement-breakpoint
DROP TABLE IF EXISTS "specializations";
