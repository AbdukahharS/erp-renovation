/**
 * English-language default renovation template.
 * Transcribed from docs/ERP_Technical_Specification_Apartment_Renovation.md
 * (the "Detailed Checklists for Each Stage and Sub-Stage" section).
 */

import { type DefaultTemplateContent, photo, video } from "./types.ts";

export const DEFAULT_TEMPLATE_EN: DefaultTemplateContent = {
	name: "Standard Apartment Renovation",
	stages: [
		{
			order: 1,
			name: "Property Preparation",
			subStages: [
				{
					code: "1.1",
					name: "Initial Property Acceptance and Recording of Baseline Data",
					performerType: "INSPECTOR",
					standardDurationDays: 1,
					wageRatePerSqm: "0",
					description:
						"Performed by Technical Supervision before masters arrive. Documents the condition as received from the developer to protect the fixed budget from hidden defects. Instruments: laser level, 2m straightedge, tape measure, sheet of paper (ventilation check).",
					mediaRequirements: [
						photo("Photos of the readings of all meters (water, electricity, heating)."),
						photo("Panoramic photos of all rooms (initial condition)."),
						photo(
							"Detailed photos of the entrance door, double-glazed windows, and window sills (scratches and chips from the developer).",
						),
						photo("Photos of the current condition of water supply and sewer risers."),
						video("Optional walkthrough video documenting initial condition.", false),
					],
					checklistItems: [
						{ text: "The entrance door has no mechanical damage; locks operate correctly." },
						{
							text: "Double-glazed windows and frames are intact, without cracks, scratches, or chips. Hardware operates without sticking.",
						},
						{
							text: "Deviation of existing walls from vertical has been measured.",
							criteria:
								"If deviation exceeds the norm, a supplementary work report is drawn up for the developer or the estimate is adjusted.",
						},
						{
							text: "Ventilation shafts are not blocked; airflow is present.",
							criteria: "Verified with a sheet of paper held over the shaft.",
						},
						{
							text: "No traces of leaks on the ceiling, walls, or near the sewer/water supply risers.",
						},
						{
							text: "The incoming electrical cable to the apartment is live; the temporary panel is operational.",
						},
						{
							text: "The shutoff valves (inlet taps) for water and heating fully stop the water without any dripping.",
						},
					],
				},
				{
					code: "1.2",
					name: "Demolition Works",
					performerType: "MASTER",
					specialization: "DEMOLITION",
					standardDurationDays: 3,
					wageRatePerSqm: "12.00",
					description:
						"Performed if the property is not bare concrete or if partition walls need to be demolished.",
					mediaRequirements: [
						photo("Photos of fully cleared rooms (floor, walls, ceiling)."),
						photo("Photos of cut-off points of old pipes/utilities (if applicable)."),
						photo(
							"Photos of removed debris (empty area in front of the apartment and a clean entrance).",
						),
					],
					checklistItems: [
						{
							text: "Only those structures specified in the demolition plan have been demolished.",
							criteria: "Cross-checked against the diagram.",
						},
						{
							text: "Old coverings (wallpaper, paint, peeling plaster), nails, and anchors have been completely removed from wall and ceiling surfaces.",
						},
						{
							text: "Points where demolished partitions meet load-bearing walls/floor/ceiling have been cleaned flush with the main surface.",
						},
						{
							text: "Construction debris has been fully collected in bags, removed from the apartment, and hauled away from the residential complex.",
						},
						{
							text: "Common areas (corridor, elevator) have been cleaned after debris removal; no complaints from the management company/neighbors.",
						},
					],
				},
				{
					code: "1.3",
					name: "Layout Tracing and Geometry Marking",
					performerType: "MASTER",
					specialization: "FOREMAN",
					standardDurationDays: 1,
					wageRatePerSqm: "5.00",
					description:
						"A critical stage before erecting new walls. An error here will result in crooked corners where built-in furniture will not fit. Instruments: laser line generator, tape measure, square.",
					mediaRequirements: [
						photo("Photos of the marking lines for future partitions on the floor."),
						photo(
							"Photos of the laser level establishing 90-degree angles in key areas (bathrooms, kitchens, areas for built-in wardrobes).",
						),
					],
					checklistItems: [
						{
							text: "Wall markings on the floor strictly correspond to the approved technical layout.",
							criteria: "Accuracy of 1 cm.",
						},
						{
							text: "In the bathroom, the marking guarantees strictly 90-degree angles for future tile laying and bathtub/shower tray installation.",
						},
						{
							text: "In the kitchen area, the wall geometry (per marking) forms a perfect right angle for the kitchen unit.",
						},
						{
							text: "Doorway dimensions in the marking account for the thickness of the future plaster layer and door installation joints.",
						},
						{ text: "Corridor markings ensure parallel walls." },
					],
				},
			],
		},
		{
			order: 2,
			name: "Geometry Construction and Plastering Works",
			subStages: [
				{
					code: "2.1",
					name: "Installation of Interior Partitions",
					performerType: "MASTER",
					specialization: "MASON",
					standardDurationDays: 5,
					wageRatePerSqm: "18.00",
					description:
						"Forms the new rooms. Inspect the masonry before plastering begins. Instruments: laser level, 2m straightedge, tape measure.",
					mediaRequirements: [
						photo("Photos of the first row of masonry (on a waterproofing tape, if wet area)."),
						photo(
							"Photos of the joints between new partitions and load-bearing walls and the ceiling.",
						),
						photo("Photos of installed lintels above doorways."),
					],
					checklistItems: [
						{
							text: "Vertical deviation of partitions does not exceed 2 mm per 1 meter of height.",
						},
						{
							text: "Partitions are rigidly tied to load-bearing walls.",
							criteria: "Rebar or perforated tape used at intervals of 2–3 rows.",
						},
						{
							text: "A damping gap has been left between the top row of masonry and the ceiling, filled with mounting foam.",
							criteria: "1–2 cm gap; protection against cracks during floor slab settlement.",
						},
						{
							text: "Lintels above doorways are installed level, with a bearing on walls of no less than 15–20 cm on each side (depending on the material).",
						},
						{
							text: "Doorway dimensions (width and height from the finished floor level) strictly correspond to the technical design.",
						},
						{
							text: "Room geometry visually and by tape measure corresponds to the plan (distances between parallel walls are equal).",
						},
					],
				},
				{
					code: "2.2",
					name: "Preparation and Setting of Beacons",
					performerType: "MASTER",
					specialization: "PLASTERER",
					standardDurationDays: 2,
					wageRatePerSqm: "8.00",
					description:
						"One of the most critical concealed stages. Technical Supervision must accept the beacons before plaster is applied. Instruments: laser level, construction square (90°).",
					mediaRequirements: [
						photo(
							"Photos of de-dusted and primed walls (wall must appear glossy or have changed color).",
						),
						photo("Photos of reinforcing mesh at the joints of dissimilar materials."),
						photo("Photos of set beacons with a laser beam applied to them."),
					],
					checklistItems: [
						{
							text: "Walls are de-dusted; primer has been applied evenly, without dry spots.",
							criteria: "Verified by touch — no dust on hands.",
						},
						{
							text: "At the joints of dissimilar materials (e.g., monolithic concrete and aerated concrete block), a fiberglass plastering mesh has been embedded.",
							criteria: "Protection against cracks.",
						},
						{
							text: "Beacons are set strictly according to the laser level; no vertical deviations.",
						},
						{
							text: "In kitchen, bathroom zones, and built-in wardrobe areas, beacons are set so the angle after plastering will be strictly 90 degrees.",
							criteria: "Verified with a square and laser along the beacons.",
						},
						{
							text: "The planned plaster layer thickness is minimized (no excess material consumption due to incorrectly set beacons).",
						},
					],
				},
				{
					code: "2.3",
					name: "Plastering Works",
					performerType: "MASTER",
					specialization: "PLASTERER",
					standardDurationDays: 6,
					wageRatePerSqm: "22.00",
					description:
						"Finalization of the geometry stage. After acceptance, the walls must be ready for laying engineering networks. Instruments: 2m straightedge, feeler gauge, construction square.",
					mediaRequirements: [
						photo("Panoramic photos of plastered rooms."),
						photo("CRITICAL: Photos of extracted metal beacons and patched grooves left by them."),
					],
					checklistItems: [
						{
							text: "Metal beacons have been extracted from the walls, and their installation points have been plastered flush.",
							criteria: "Beacons left in place will cause rust on the finish coat.",
						},
						{
							text: "Applying a 2-meter straightedge in all directions (vertical, horizontal, diagonal) shows a gap of no more than 1.5–2 mm.",
						},
						{
							text: "Corners in bathrooms, kitchen, and built-in furniture areas are exactly 90 degrees.",
							criteria: "Deviation no more than 1 mm per 1 meter.",
						},
						{
							text: "The wall-to-floor junction line (future baseboard zone) has been brought to a perfect line without bumps or dips.",
						},
						{
							text: "The plaster surface is uniform, without deep scratches, mortar drips, or delamination.",
							criteria: "No hollow sound when tapped.",
						},
					],
				},
			],
		},
		{
			order: 3,
			name: "Rough Engineering Networks",
			subStages: [
				{
					code: "3.1",
					name: "Rough Air Conditioning and Ventilation",
					performerType: "MASTER",
					specialization: "HVAC",
					standardDurationDays: 2,
					wageRatePerSqm: "10.00",
					description:
						"Installed first, as air conditioning routes are the most bulky and frequently intersect with electrical wiring. Instruments: bubble level, tape measure.",
					mediaRequirements: [
						photo("Photos of refrigerant lines laid from the indoor unit to the outdoor unit."),
						photo(
							"Photos of the air conditioner drain pipe connection to the sewer riser (through a dedicated siphon with a dry trap).",
						),
						photo("Photos of outlets for indoor units with a level applied."),
					],
					checklistItems: [
						{
							text: "Refrigerant lines are fully wrapped in insulation (flex) along their entire length, with no insulation breaks.",
							criteria: "Prevents condensation forming inside walls.",
						},
						{
							text: "The drain line is laid with a continuous slope of no less than 2–3 degrees toward the drain.",
							criteria: "No counter-slopes or sagging.",
						},
						{
							text: "The drain is connected to the sewer STRICTLY through a siphon with a dry/drip trap.",
							criteria: "Prevents sewer odors from entering the apartment.",
						},
						{
							text: "Lines are securely fastened to the ceiling/walls with perforated tape or clamps; no sagging.",
						},
						{
							text: "Refrigerant pipe and power cable outlets have sufficient excess length for future unit connections.",
							criteria: "At least 50 cm.",
						},
					],
				},
				{
					code: "3.2",
					name: "Rough Plumbing",
					performerType: "MASTER",
					specialization: "PLUMBER",
					standardDurationDays: 4,
					wageRatePerSqm: "16.00",
					description:
						"Water supply pipes, sewage, and concealed cistern frames. The riskiest stage in terms of future claims (leaks). Instruments: pressure test pump with gauge, laser level, tape measure, square.",
					mediaRequirements: [
						photo(
							"Photos of the assembled manifold assembly (manifolds, filters, pressure reducers).",
						),
						photo(
							"Photos of cistern frames for wall-hung toilets/basins with a level and tape measure applied (recording the height).",
						),
						photo("Photos of the pressure gauge during hydraulic testing (pressure testing)."),
						photo("Photos of the sewer riser soundproofing."),
					],
					checklistItems: [
						{
							text: "CRITICAL TEST: Pressure testing of the water supply system has been performed.",
							criteria:
								"Usually 10 bar for 30 minutes. No pressure drop on the gauge; no leaks at connections.",
						},
						{
							text: "Toilet cistern frames are rigidly secured (do not wobble under load), set strictly level in all planes.",
						},
						{
							text: "The finished floor mark on the cistern frame strictly corresponds to the calculated level of the future floor covering.",
							criteria: "Usually 1 meter; accounting for screed and tile thickness.",
						},
						{
							text: "Outlets for concealed mixer taps are installed at the correct depth (per the instructions for the specific model) and are strictly level.",
						},
						{
							text: "Sewer pipes are laid with the standard slope.",
							criteria: "2 cm per 1 meter for 50mm pipes; 1 cm per 1 meter for 110mm pipes.",
						},
						{
							text: "All water supply pipes are wrapped in thermal insulation (red/blue), and pipes on the floor are securely fastened to the floor slab.",
						},
						{
							text: "The sewer riser is wrapped in automotive or specialized soundproofing material without gaps.",
						},
					],
				},
				{
					code: "3.3",
					name: "Rough Electrical and Low-Voltage Networks",
					performerType: "MASTER",
					specialization: "ELECTRICIAN",
					standardDurationDays: 4,
					wageRatePerSqm: "15.00",
					description: "Instruments: laser level, tape measure, multimeter.",
					mediaRequirements: [
						photo("Photos of the assembled electrical panel without front covers installed."),
						photo("Photos of the low-voltage panel (router, TV splitters)."),
						photo("Photos of all junction boxes in open condition (before insulation)."),
						photo("Panoramic photos of cable routes on the ceiling and wall channels."),
					],
					checklistItems: [
						{
							text: "Wall channels are routed strictly vertically from sockets/switches to the ceiling. Horizontal wall channels and diagonal routing are absent.",
						},
						{
							text: "Power and low-voltage cables (internet, TV) are routed in separate conduits and cross only at right angles.",
							criteria: "Preventing interference and noise.",
						},
						{
							text: "Connections in junction boxes are made by welding, crimping with ferrules, or Wago terminals.",
							criteria: "Twists are STRICTLY prohibited.",
						},
						{
							text: "Back boxes are set into walls flush with the plaster surface (neither protruding nor recessed too deeply), and are cleared of mortar.",
						},
						{
							text: "Height of back boxes and their position relative to doorways/corners corresponds to the design with accuracy of 1 cm.",
						},
						{
							text: "All cables in the electrical panel are labeled; circuit breaker ratings correspond to the cross-section of outgoing cables.",
							criteria: "E.g., for sockets: 2.5mm² cable — breaker no more than 16A.",
						},
					],
				},
			],
		},
		{
			order: 4,
			name: "Floor Screed Installation",
			subStages: [
				{
					code: "4.1",
					name: "Base Preparation and Soundproofing",
					performerType: "MASTER",
					specialization: "SCREED",
					standardDurationDays: 1,
					wageRatePerSqm: "6.00",
					description:
						"The screed must not rigidly contact the walls and floor slabs, otherwise it will transmit all impact noise to the neighbors (and violate the 'floating floor' technology).",
					mediaRequirements: [
						photo("Photos of the concrete base cleared of construction debris and dust."),
						photo(
							"Photos of the laid soundproofing material (e.g., 'Shumanet' or equivalent) with taped joints.",
						),
						photo("Photos of the perimeter of all rooms with secured damping tape."),
						photo("Photos of the laid reinforcing mesh (if wet screed is used)."),
					],
					checklistItems: [
						{
							text: "The base is completely cleared of debris; cable routes and pipes on the floor are securely fastened and not 'hanging' in the air.",
						},
						{
							text: "Damping tape is laid along the entire perimeter of the rooms, and is also wrapped around all heating and water pipes coming up from the floor.",
							criteria: "8–10 mm thick.",
						},
						{
							text: "Soundproofing sheets are laid overlapping (or butt-joined with reinforced tape), with no tears or gaps through which mortar could seep to the floor slab.",
						},
						{
							text: "Engineering utilities (pipes) do not cross each other vertically in critical areas (otherwise the screed over them will be too thin and will crack).",
						},
					],
				},
				{
					code: "4.2",
					name: "Screed Pouring",
					performerType: "MASTER",
					specialization: "SCREED",
					standardDurationDays: 3,
					wageRatePerSqm: "14.00",
					description:
						"Modern renovations typically use a semi-dry mechanized screed for a perfectly level surface and faster drying. Instruments: 2m straightedge, laser line generator, tape measure.",
					mediaRequirements: [
						photo(
							"Photos of the finished screed covered with polyethylene film (for proper strength gain and moisture retention).",
						),
						photo("Photos of cut expansion joints."),
					],
					checklistItems: [
						{
							text: "GEOMETRY: Applying a 2-meter straightedge in different directions shows a gap of no more than 2 mm.",
							criteria: "Critical for laying quartz vinyl, laminate, or large-format tiles.",
						},
						{
							text: "LEVEL: The finished screed mark strictly corresponds to the design height, accounting for the future floor covering thickness.",
							criteria: "E.g., exactly 15 mm has been left for engineered hardwood and adhesive.",
						},
						{
							text: "Multi-level screed (if the project has a junction between tiles and laminate of different thicknesses) has been made with the exact height difference per design.",
						},
						{
							text: "Expansion (shrinkage) joints are cut in doorways and in rooms with an area of more than 20 sq.m.",
							criteria: "Prevents random cracking of the screed.",
						},
						{
							text: "The screed surface is dense, does not crumble underfoot, and has no loose areas.",
						},
						{
							text: "Walls (plastered at the previous stage) are not splashed with screed mortar; the damping tape protrudes above the floor level.",
						},
					],
				},
			],
		},
		{
			order: 5,
			name: "Pre-Finish Preparation (White Box)",
			subStages: [
				{
					code: "5.1",
					name: "Installation of Drywall Structures",
					performerType: "MASTER",
					specialization: "DRYWALL",
					standardDurationDays: 4,
					wageRatePerSqm: "13.00",
					description:
						"Ceilings, boxing structures, niches for concealed curtain rods. Submitted for acceptance in two phases: first the concealed frame, then the cladding. Instruments: laser level, tape measure, 2m straightedge.",
					mediaRequirements: [
						photo("Photos of the assembled metal frame before drywall cladding."),
						photo(
							"Photos of installed plywood backing plates (for future wardrobes, heavy chandeliers, or TVs).",
						),
						photo(
							"Photos of the finished structures after cladding (separately: shadow joint nodes at walls).",
						),
					],
					checklistItems: [
						{
							text: "The spacing of the load-bearing ceiling profile is strictly 400 mm.",
							criteria: "Standard for reliability for painting.",
						},
						{
							text: "Backing elements are installed in all locations specified in the technical design and are securely fastened.",
						},
						{
							text: "Drywall sheets are installed in a staggered pattern (joints do not form crosses); factory edges are chamfered at 22.5 degrees for filler compound.",
						},
						{
							text: "No hanging joints: all sheet connections fall strictly on a metal profile.",
						},
						{
							text: "Shadow profiles (ceiling or skirting) are set in a single plane without level differences at joints; corners are mitered at 45 degrees.",
						},
					],
				},
				{
					code: "5.2",
					name: "Installation of Concealed Door Frames",
					performerType: "MASTER",
					specialization: "DOOR_INSTALLER",
					standardDurationDays: 1,
					wageRatePerSqm: "5.00",
					description:
						"In minimalist renovations, flush-mount doors are installed before painting, so painters can bring the wall to the same level as the frame. Instruments: laser line generator, spirit level, tape measure.",
					mediaRequirements: [
						photo("Photos of the installed frame with spreader bars inserted."),
						photo("Photos of the laser level projecting the plane of the wall and frame."),
					],
					checklistItems: [
						{
							text: "The aluminum door frame is set strictly in the same plane as the plastered wall.",
							criteria: "Deviation 0 mm.",
						},
						{ text: "The frame is set strictly vertical in all planes." },
						{
							text: "The correct gap from the bottom edge of the frame to the finished floor level has been maintained (accounting for floor covering thickness).",
						},
						{
							text: "The gap between the frame and the wall is tightly and evenly filled with mounting foam.",
						},
					],
				},
				{
					code: "5.3",
					name: "Painting Preparation Works",
					performerType: "MASTER",
					specialization: "PAINTER",
					standardDurationDays: 8,
					wageRatePerSqm: "20.00",
					description:
						"The longest and most demanding stage. Accepted using strict quality criteria (Q4 standard). Instruments: painter's inspection lamp (oblique lighting lamp) — mandatory; 2m straightedge.",
					mediaRequirements: [
						photo(
							"Photos of patched drywall joints using reinforcing paper tape (not fiberglass mesh!).",
						),
						photo(
							"Photos of applied non-woven fabric on all walls and ceilings (protection against micro-cracks).",
						),
						photo(
							"Photos of installed metal or plastic corner protection profiles on all external corners.",
						),
					],
					checklistItems: [
						{
							text: "External corners (window reveals, boxing) are perfectly straight; profiles do not protrude beyond the wall plane; angle is strictly 90 degrees.",
						},
						{
							text: "Wall-to-ceiling and wall-to-floor junction lines are brought to a perfect 90-degree line.",
							criteria: "Critical for installing concealed skirting and shadow ceilings.",
						},
						{
							text: "OBLIQUE LIGHT CHECK: When directing the inspection lamp parallel to the wall/ceiling surface, no dips, bumps, deep sanding scratches, or filler drips are visible. The surface is uniform.",
						},
						{
							text: "Window reveals are prepared for painting; planes are even, reveal angles are identical on both sides.",
						},
						{
							text: "Rooms are fully cleared of painting dust; walls are primed and ready for the final coat (paint).",
						},
					],
				},
			],
		},
		{
			order: 6,
			name: "Finish Coating",
			subStages: [
				{
					code: "6.1",
					name: "Tile Laying",
					performerType: "MASTER",
					specialization: "TILER",
					standardDurationDays: 6,
					wageRatePerSqm: "25.00",
					description:
						"The most expensive type of finish. The system must record tile adhesive and grout consumption. Instruments: laser line generator, 2m straightedge, construction square, feeler gauge.",
					mediaRequirements: [
						photo(
							"Photos of the 'dry' layout of the first row (agreeing on the pattern and cuts).",
						),
						photo(
							"Photos of applied waterproofing (if not submitted at the rough plumbing stage).",
						),
						photo("Photos of joints cleaned of adhesive before applying epoxy or cement grout."),
						photo(
							"Photos of used packaging (adhesive bags, grout containers) for cross-checking consumption against the unit estimate.",
						),
					],
					checklistItems: [
						{
							text: "Deviation of the laid tile plane does not exceed 1.5 mm per 2 meters.",
							criteria: "Verified with a straightedge along all diagonals.",
						},
						{
							text: "Narrow cuts (less than 5 cm) are absent in visible areas; layout is symmetrical (according to the design).",
						},
						{
							text: "All external corners (boxing, niches) are done strictly by 45-degree mitering; no chips on the enamel.",
						},
						{
							text: "Tile joints are uniform (standard 1–1.5 mm); spacers and leveling systems (tile leveling clips) are fully removed.",
						},
						{
							text: "Grout is applied evenly, without gaps, voids, or drips onto the tile surface. Epoxy grout has been cleaned without residue (tile surface is not sticky).",
						},
						{
							text: "When tapped with a rubber mallet, no hollow sounds are detected over the entire area.",
						},
					],
				},
				{
					code: "6.2",
					name: "Painting of Walls and Ceilings",
					performerType: "MASTER",
					specialization: "PAINTER",
					standardDurationDays: 3,
					wageRatePerSqm: "12.00",
					description:
						"Paint is applied only after the property has been fully de-dusted. Instruments: inspection lamp (oblique light).",
					mediaRequirements: [
						photo(
							"Photos of windows, the entrance door, and concealed door frames covered with protective film (protection from splatter).",
						),
						photo("Photos of empty paint containers (consumption control)."),
					],
					checklistItems: [
						{
							text: "Surface is painted evenly; missed spots, roller stripes, and stains are absent.",
							criteria: "Verified under inspection light.",
						},
						{
							text: "No stuck debris, roller fibers, or paint drips on the painted surface.",
						},
						{
							text: "The junction line between two different colors (e.g., ceiling/wall) is perfectly straight, without bleed-through.",
							criteria: "Verified from a distance of 1 meter.",
						},
					],
				},
				{
					code: "6.3",
					name: "Floor Covering Installation",
					performerType: "MASTER",
					specialization: "FLOORING",
					standardDurationDays: 2,
					wageRatePerSqm: "11.00",
					description: "Laminate, quartz vinyl, or engineered hardwood.",
					mediaRequirements: [
						photo("Photos of the cleaned screed and laid underlayment with taped joints."),
						photo("Detailed photos of expansion gaps along the wall perimeter."),
					],
					checklistItems: [
						{
							text: "Floor covering is laid without thresholds as a single continuous field (if permitted by the area and manufacturer's regulations).",
						},
						{
							text: "A technical expansion gap has been maintained along the entire perimeter at walls, pipes, and built-in furniture.",
							criteria: "Usually 8–10 mm.",
						},
						{
							text: "Walking on the surface produces no squeaks, crunching, or deflection (lock joint is not broken; screed is level).",
						},
						{
							text: "The pattern (wood texture) is distributed randomly; no unnatural repetitions of identical planks side by side.",
						},
					],
				},
			],
		},
		{
			order: 7,
			name: "Finish Installation (Engineering Networks and Hardware)",
			subStages: [
				{
					code: "7.1",
					name: "Finish Electrical Work",
					performerType: "MASTER",
					specialization: "ELECTRICIAN",
					standardDurationDays: 2,
					wageRatePerSqm: "8.00",
					description:
						"After all dusty and wet work is completed, the system automatically invites electricians for installation of face hardware.",
					mediaRequirements: [
						photo("Photos of installed faceplates and finished electrical panel."),
					],
					checklistItems: [
						{ text: "Socket and switch faceplates fit tightly against the wall with no gaps." },
						{
							text: "Mechanisms are installed strictly horizontal.",
							criteria: "Verified with a mini-level.",
						},
						{ text: "All light fixtures are connected and operational." },
						{
							text: "The electrical panel is fully assembled; front covers are installed; final circuit breaker labels are applied. RCD/RCBO test button operation has been verified.",
						},
					],
				},
				{
					code: "7.2",
					name: "Finish Plumbing",
					performerType: "MASTER",
					specialization: "PLUMBER",
					standardDurationDays: 2,
					wageRatePerSqm: "9.00",
					description:
						"After all dusty and wet work is completed, the system automatically invites plumbers for installation of face hardware.",
					mediaRequirements: [
						photo("Photos of installed wall-hung toilet, basins, and shower systems."),
						photo("Photos of all wet-area sealant joints."),
					],
					checklistItems: [
						{
							text: "Wall-hung toilet, basins, and shower systems are installed strictly level.",
						},
						{
							text: "Chrome/matte black parts of mixers have no wrench scratches.",
							criteria: "Installation was performed with the proper tool.",
						},
						{
							text: "All wet areas (bathtub/basin-to-tile junction) are treated with sanitary sealant; the bead is even, without gaps.",
						},
						{
							text: "Water has been run for 10 minutes at all points: no leaks under basins or the bathtub; water drains quickly.",
							criteria: "Slopes are correct.",
						},
					],
				},
			],
		},
		{
			order: 8,
			name: "Cleaning and Final Acceptance (Unit Closing)",
			subStages: [
				{
					code: "8.1",
					name: "Professional Cleaning",
					performerType: "MASTER",
					specialization: "CLEANING",
					standardDurationDays: 1,
					wageRatePerSqm: "4.00",
					description:
						"The system will not pass the property to the final stage without cleanliness. Performed by an external cleaning contractor.",
					mediaRequirements: [
						photo("Photos of cleaned surfaces, windows, mirrors, and shower partitions."),
					],
					checklistItems: [
						{
							text: "Construction dust has been completely removed from all surfaces, including the inner parts of heating radiators and the top edges of doors.",
						},
						{
							text: "Windows, mirrors, and glass shower partitions have been washed without streaks.",
						},
						{
							text: "No traces of construction compounds, tape, or paint on windows or tiles.",
						},
					],
				},
				{
					code: "8.2",
					name: "Final Audit and Financial Closing",
					performerType: "INSPECTOR",
					standardDurationDays: 1,
					wageRatePerSqm: "0",
					description:
						"System step within the ERP that records the success of the production cycle. Performed by the Owner or Inspector with closing permission.",
					mediaRequirements: [
						photo("Final professional photos of the finished renovation (portfolio formation)."),
					],
					checklistItems: [
						{
							text: "Portfolio formation: final professional photos of the finished renovation have been uploaded to the property card.",
						},
						{
							text: "Defect summary: the ERP has analyzed the number of returns (defects) at each stage and automatically adjusted the internal master ratings.",
						},
						{
							text: "Unit economics recording: the system has consolidated all transactions (material costs, paid master wages, transportation expenses) and output the final project profitability.",
							criteria: "If the cost has been kept within target — green marker.",
						},
						{
							text: "Acceptance and handover certificate has been automatically generated for signing.",
						},
						{
							text: "Status change: 'Property Successfully Completed' has been pressed; pipeline cycle is finished.",
						},
					],
				},
			],
		},
	],
};
