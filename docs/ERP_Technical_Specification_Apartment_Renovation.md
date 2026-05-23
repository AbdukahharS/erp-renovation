# **Technical Specification (TS) for the Development of an ERP System for Streamlined Apartment Renovation**

## 1. Product Concept and Goal

Development of an internal process management system for standardized apartment renovation.

**Key paradigm:** assembly-line approach, strict process standardization, minimization of the human factor.

**Strategic goal:** trial of the product on internal properties, followed by scaling into a B2B SaaS solution for third-party construction companies.

**UI/UX design requirement:** modern minimalism. The interface must be as clean as possible, free of unnecessary visual noise, so as not to distract front-line staff from target actions.

---

## 2. Role Model and Access Levels

The system must support independent accounts (Multi-tenancy) for the future SaaS model. Within each "company account," the following roles are provided:

- **Owner / Manager:** Full access. Views consolidated analytics, unit economics, manages process templates and rates.

- **Technical Supervision Specialist (Inspector):** Access to assigned properties. Rights to accept stages of work, block/unblock subsequent stages, and apply fines for defects.

- **Master (Executor):** Access only to their current tasks on a specific property. Can take a task into work, attach photo/video reports, and request stage acceptance.

---

## 3. Description of Functional Modules

### Module 1. Property Management (Units)

Functionality for adding new projects to the system.

- **Property card:** Address, new build/secondary market layout (with the ability to upload minimalist floor plans), current status (pending, in progress, completed).

- **Templating:** When a property is created, a single standard renovation scenario (a sequence of X steps) is automatically applied to it.

### Module 2. Work Pipeline and Strict Routing

The foundation of the system is an inviolable sequence of stages (e.g.: demolition → partition construction → electrical → rough plumbing, etc.).

- **Stage blocking:** The system must physically prevent assigning a master to stage B (e.g., plastering) until technical supervision has accepted stage A (e.g., electrical work).

- **Time slots:** Each stage has a standard duration in days/hours for automatic schedule generation.

### Module 3. Stage-by-Stage Acceptance and Checklists

Transitioning technical supervision from a "constant presence" format to an "acceptance at control points" format.

- **Completion form for the Master:** Pressing the "Complete" button. A mandatory field for uploading media files (photos of concealed works). The button is inactive without photos.

- **Technical Supervision Interface:** Upon receiving an acceptance request, the specialist opens a digital checklist (a set of parameters to be verified). Checks Yes/No boxes.

- **Resolution:** If there is a defect, the inspector presses "Reject," writes a comment, and the task is returned to the master. If everything is fine — "Accept." Only after this is the stage closed.

### Module 4. Master Database Management (HR Module)

Given the plan to attract narrowly specialized professionals through targeted advertising, the system must quickly aggregate their profiles.

- **Master application form:** Full name, specialization (electrician, tiler), contact details. Option for quick registration via an invitation link.

- **Rating system:** Automatic calculation of rating based on work speed and number of defects (returns from technical supervision).

- **Availability schedule:** Visualization of master status: "Available," "On property X until [date]."

### Module 5. Financial Accounting and Unit Economics

- **Target cost control:** The planned unit cost (base calculation indicator, e.g., $230 per square meter or another chosen unit of measurement) is strictly fixed in the system.

- **Piece-rate wages (payroll):** The amount payable to the master is credited to their virtual balance strictly automatically and only after the inspector presses the "Accept Stage" button.

- **Financial dashboard:** Display of each property's profitability in real time (Plan vs. Actual), taking into account purchased rough materials and paid wages.

---

## 4. Platforms and Usage Formats

- **Web version (Desktop):** For the Owner (settings, finances, in-depth analytics) and for creating templates.

- **Mobile version (PWA or Telegram bot):** A mandatory requirement for Masters and Technical Supervision. Large buttons, the ability to take a photo directly in the app, instant push notifications (e.g.: "You have been assigned a task at Property #5" or "The electrical stage has not been accepted, please fix the issues").

---

## 5. SaaS Readiness Requirements (Hidden Requirements for Developers)

- Each future client's (tenant's) data must be logically isolated from one another at the database level.

- The system must support process customization (creating custom stage chains and custom checklists) so that other companies can adapt the pipeline to their own standards.

---

## Architecture of the Business Process (Workflow)

### 1. Property Initiation and Budget Formation

The process begins from the moment the contract is signed and a new unit is entered into the system.

**Manager/owner action:** Creating a new property card in the system (address, floor plan in minimalist format, deadlines).

**System automation:**
- Application of the standard renovation template to the property.
- Automatic generation of an estimate and fixing of the planned unit cost (with a strict limit on purchasing rough materials and the wage fund).
- Deployment of the work schedule (Gantt or Kanban board) broken down into clear stages (e.g., 15 standard steps).

### 2. Supply and Procurement (Zero Stage)

Before the masters go to the property, it must be prepared.

**Procurement specialist action:** Receiving an automatically generated list of rough materials required for the first stages of the pipeline.

**Technical supervision action:** Recording the initial condition of the property (uploading "before" photos), verifying the availability of materials.

**System automation:** Changing the property status to "Ready for Production." Unlocking the first stage of work for masters.

### 3. Production Cycle: Master's Work

This is a repeating cycle for each construction stage (demolition, electrical, plastering, etc.).

**Assignment:** The master from the formed contractor database receives a notification (e.g., in Telegram) about an available stage at the property. They press the "Take into Work" button.

**Execution:** The master sees only their task, deadlines, and requirements. The rest of the interface is hidden.

**Stage submission:** Upon completion, the master presses the "Complete Stage" button.

**Mandatory requirement:** The system blocks the submission request until the master has attached the required photos of concealed works and results.

### 4. Stage-by-Stage Acceptance: Technical Supervision Block

The quality control function is integrated directly into the stage handover process.

**Notification:** The technical supervision specialist receives a push notification that a stage is ready.

**Checklist verification:** A digital acceptance sheet for the specific stage is opened. The inspector physically checks the property and marks compliance checkboxes.

**Decision making:**

- **Scenario A (Defect):** The inspector presses "Reject," attaches a photo of the defect and a comment. The stage is returned to the master for rework without payment.

- **Scenario B (Success):** The inspector presses "Accept."

### 5. Financial and Routing Automation (Hidden Process)

As soon as the inspector presses the "Accept" button, the system instantly performs several actions without human involvement:

**Finances:** The master is automatically credited with payment for the completed stage to their internal balance. The system deducts this amount from the property's planned budget, updating the profitability.

**Routing:** The current stage is closed. The system automatically **unlocks the next stage** and sends notifications to masters of the next profile (e.g., after plastering is accepted, painters receive a notification).

Cycles 3, 4, and 5 repeat until all regulated stages of the template have been completed.

### 6. Final Handover and Unit Closing

When the last production stage is closed (e.g., cleaning and debris removal), the property moves to the final acceptance status.

**Technical supervision/manager action:** Final walkthrough with a client handover readiness checklist. Uploading finished photos for the portfolio.

**System action:**
- Generation of the final financial report for the property (Plan vs. Actual).
- Calculation of the final net profit from this unit.
- Transition of the property to the archived status "Completed."

---

## Detailed Checklists for Each Stage and Sub-Stage Including Technical Supervision

---

## Stage 1: Property Preparation

### Sub-stage 1.1: Initial Property Acceptance and Recording of Baseline Data

This stage is performed by Technical Supervision or the site foreman before the masters arrive. The task is to document the condition as received from the developer, in order to protect the fixed budget from hidden defects.

**Photo/video report requirements (mandatory for start):**

- Photos of the readings of all meters (water, electricity, heating).
- Panoramic photos of all rooms (recording of initial condition).
- Detailed photos of the entrance door, double-glazed windows, and window sills (for scratches and chips from the developer).
- Photos of the current condition of water supply and sewer risers.

**Instrumental inspection:**
- Laser level, straightedge (2m), tape measure, sheet of paper (for ventilation check).

**Control points for Technical Supervision (Yes/No):**

- [ ] The entrance door has no mechanical damage; locks operate correctly.
- [ ] Double-glazed windows and frames are intact, without cracks, scratches, or chips. Hardware operates without sticking.
- [ ] Deviation of existing walls from vertical has been measured. (If deviation exceeds the norm, a supplementary work report is drawn up for the developer or the estimate is adjusted.)
- [ ] Ventilation shafts are not blocked; airflow is present (checked with a sheet of paper).
- [ ] No traces of leaks on the ceiling, walls, or near the sewer/water supply risers.
- [ ] The incoming electrical cable to the apartment is live; the temporary panel is operational.
- [ ] The shutoff valves (inlet taps) for water and heating fully stop the water without any dripping.

---

### Sub-stage 1.2: Demolition Works (Master: Demolition Specialist)

Performed if the property is not bare concrete or if partition walls need to be demolished.

**Photo report from the master (task completion blocker):**

- Photos of fully cleared rooms (floor, walls, ceiling).
- Photos of cut-off points of old pipes/utilities (if applicable).
- Photos of removed debris (empty area in front of the apartment and a clean entrance).

**Control points for Technical Supervision (Yes/No):**

- [ ] Only those structures specified in the demolition plan have been demolished (cross-checked against the diagram).
- [ ] Old coverings (wallpaper, paint, peeling plaster), nails, and anchors have been completely removed from wall and ceiling surfaces.
- [ ] Points where demolished partitions meet load-bearing walls/floor/ceiling have been cleaned flush with the main surface.
- [ ] Construction debris has been fully collected in bags, removed from the apartment, and hauled away from the residential complex.
- [ ] Common areas (corridor, elevator) have been cleaned after debris removal; no complaints from the management company/neighbors.

---

### Sub-stage 1.3: Layout Tracing and Geometry Marking (Master: Site Foreman / Marker)

A critical stage before erecting new walls. An error here will result in crooked corners where built-in furniture will not fit.

**Photo report from the master:**

- Photos of the marking lines for future partitions on the floor.
- Photos of the laser level establishing 90-degree angles in key areas (bathrooms, kitchens, areas for built-in wardrobes).

**Instrumental inspection:**
- Laser line generator, tape measure, square.

**Control points for Technical Supervision (Yes/No):**

- [ ] Wall markings on the floor strictly correspond to the approved technical layout with an accuracy of 1 cm.
- [ ] In the bathroom, the marking guarantees strictly 90-degree angles for future tile laying and bathtub/shower tray installation.
- [ ] In the kitchen area, the wall geometry (per marking) forms a perfect right angle for the kitchen unit.
- [ ] Doorway dimensions in the marking account for the thickness of the future plaster layer and door installation joints.
- [ ] Corridor markings ensure parallel walls.

Once Technical Supervision presses "Accept" for the tracing stage, the system automatically grants access to masons/drywall installers for partition construction.

---

## Stage 2: Geometry Construction and Plastering Works

### Sub-stage 2.1: Installation of Interior Partitions (Master: Mason / Installer)

This stage forms the new rooms. In the pipeline, it is important to inspect the masonry before plastering begins.

**Photo report from the master (task completion blocker):**

- Photos of the first row of masonry (on a waterproofing tape, if this is a wet area).
- Photos of the joints between new partitions and load-bearing walls and the ceiling.
- Photos of installed lintels above doorways.

**Instrumental inspection:**
- Laser level, straightedge (2m), tape measure.

**Control points for Technical Supervision (Yes/No):**

- [ ] Vertical deviation of partitions does not exceed 2 mm per 1 meter of height.
- [ ] Partitions are rigidly tied to load-bearing walls (rebar or perforated tape used at intervals of 2–3 rows).
- [ ] A damping gap (1–2 cm) has been left between the top row of masonry and the ceiling, filled with mounting foam (protection against cracks during floor slab settlement).
- [ ] Lintels above doorways are installed level, with a bearing on walls of no less than 15–20 cm on each side (depending on the material).
- [ ] Doorway dimensions (width and height from the finished floor level) strictly correspond to the technical design.
- [ ] Room geometry visually and by tape measure corresponds to the plan (distances between parallel walls are equal).

---

### Sub-stage 2.2: Preparation and Setting of Beacons (Master: Plasterer)

One of the most critical concealed stages. Technical Supervision must accept the beacons before plaster is applied to the walls.

**Photo report from the master:**

- Photos of de-dusted and primed walls (the wall must appear glossy or have changed color).
- Photos of reinforcing mesh at the joints of dissimilar materials.
- Photos of set beacons with a laser beam applied to them.

**Instrumental inspection:**
- Laser level, construction square (90 degrees).

**Control points for Technical Supervision (Yes/No):**

- [ ] Walls are de-dusted; primer has been applied evenly, without dry spots (verified by touch — no dust on hands).
- [ ] At the joints of dissimilar materials (e.g., monolithic concrete and aerated concrete block), a fiberglass plastering mesh has been embedded (protection against cracks).
- [ ] Beacons are set strictly according to the laser level; no vertical deviations.
- [ ] In the kitchen, bathroom zones, and areas where built-in wardrobes will be installed, beacons are set so that the angle after plastering will be strictly 90 degrees (verified with a square and laser along the beacons).
- [ ] The planned plaster layer thickness is minimized (no excess material consumption due to incorrectly set beacons).

---

### Sub-stage 2.3: Plastering Works (Master: Plasterer)

Finalization of the geometry stage. After acceptance, the walls must be ready for laying engineering networks.

**Photo report from the master:**

- Panoramic photos of plastered rooms.
- **Critical:** Photos of extracted metal beacons and patched grooves left by them.

**Instrumental inspection:**
- Straightedge (2m), feeler gauge, construction square.

**Control points for Technical Supervision (Yes/No):**

- [ ] **Metal beacons have been extracted from the walls**, and their installation points have been plastered flush (beacons left in place will cause rust on the finish coat).
- [ ] Applying a 2-meter straightedge in all directions (vertical, horizontal, diagonal) shows a gap of no more than 1.5–2 mm.
- [ ] Corners in bathrooms, in the kitchen, and in built-in furniture areas are exactly 90 degrees (deviation no more than 1 mm per 1 meter).
- [ ] The wall-to-floor junction line (future baseboard zone) has been brought to a perfect line without bumps or dips.
- [ ] The plaster surface is uniform, without deep scratches, mortar drips, or delamination (no hollow sound when tapped).

---

## Stage 3: Rough Engineering Networks

### Sub-stage 3.1: Rough Air Conditioning and Ventilation (Master: HVAC Installer)

Installed first, as air conditioning routes are the most bulky and frequently intersect with electrical wiring.

**Photo report from the master (task completion blocker):**

- Photos of refrigerant lines laid from the indoor unit to the outdoor unit.
- Photos of the air conditioner drain pipe connection to the sewer riser (through a dedicated siphon with a dry trap).
- Photos of outlets for indoor units with a level applied.

**Instrumental inspection:**
- Bubble level, tape measure.

**Control points for Technical Supervision (Yes/No):**

- [ ] Refrigerant lines are fully wrapped in insulation (flex) along their entire length, with no insulation breaks (prevents condensation forming inside walls).
- [ ] The drain line is laid with a continuous slope of no less than 2–3 degrees toward the drain (no counter-slopes or sagging).
- [ ] The drain is connected to the sewer STRICTLY through a siphon with a dry/drip trap (to prevent sewer odors from entering the apartment).
- [ ] Lines are securely fastened to the ceiling/walls with perforated tape or clamps; no sagging.
- [ ] Refrigerant pipe and power cable outlets have sufficient excess length (at least 50 cm) for future unit connections.

---

### Sub-stage 3.2: Rough Plumbing (Master: Plumber)

Installation of water supply pipes, sewage, and concealed cistern frames. The riskiest stage in terms of future claims (leaks).

**Photo report from the master:**

- Photos of the assembled manifold assembly (manifolds, filters, pressure reducers).
- Photos of cistern frames for wall-hung toilets/basins with a level and tape measure applied (recording the height).
- Photos of the pressure gauge during hydraulic testing (pressure testing).
- Photos of the sewer riser soundproofing.

**Instrumental inspection:**
- Pressure test pump with gauge, laser level, tape measure, square.

**Control points for Technical Supervision (Yes/No):**

- [ ] **Critical test:** Pressure testing of the water supply system at pressure (usually 10 bar) for 30 minutes has been performed. No pressure drop on the gauge; no leaks at connections.
- [ ] Toilet cistern frames are rigidly secured (do not wobble under load), set strictly level in all planes.
- [ ] The finished floor mark on the cistern frame (usually 1 meter) strictly corresponds to the calculated level of the future floor covering (accounting for screed and tile thickness).
- [ ] Outlets for concealed mixer taps are installed at the correct depth (according to the instructions for the specific model) and are strictly level.
- [ ] Sewer pipes are laid with the standard slope (2 cm per 1 meter for 50mm pipes; 1 cm per 1 meter for 110mm pipes).
- [ ] All water supply pipes are wrapped in thermal insulation (red/blue), and pipes on the floor are securely fastened to the floor slab.
- [ ] The sewer riser is wrapped in automotive or specialized soundproofing material (without gaps).

---

### Sub-stage 3.3: Rough Electrical and Low-Voltage Networks (Master: Electrician)

**Photo report from the master:**

- Photos of the assembled electrical panel without front covers installed.
- Photos of the low-voltage panel (router, TV splitters).
- Photos of all junction boxes in open condition (before insulation).
- Panoramic photos of cable routes on the ceiling and wall channels.

**Instrumental inspection:**
- Laser level, tape measure, multimeter.

**Control points for Technical Supervision (Yes/No):**

- [ ] Wall channels are routed strictly vertically from sockets/switches to the ceiling. Horizontal wall channels and diagonal routing are absent.
- [ ] Power and low-voltage cables (internet, TV) are routed in separate conduits and cross only at right angles (preventing interference and noise).
- [ ] Connections in junction boxes are made by welding, crimping with ferrules, or Wago terminals (according to your internal standard). Twists are STRICTLY prohibited.
- [ ] Back boxes are set into walls flush with the plaster surface (neither protruding nor recessed too deeply), and are cleared of mortar.
- [ ] Height of back boxes and their position relative to doorways/corners corresponds to the design with accuracy of 1 cm.
- [ ] All cables in the electrical panel are labeled; circuit breaker ratings correspond to the cross-section of outgoing cables (e.g., for sockets: 2.5mm² cable — breaker no more than 16A).

---

## Stage 4: Floor Screed Installation

### Sub-stage 4.1: Base Preparation and Soundproofing (Master: Prep Worker / Screed Layer)

The screed must not rigidly contact the walls and floor slabs, otherwise it will transmit all impact noise to the neighbors (and violate the "floating floor" technology).

**Photo report from the master (task completion blocker):**

- Photos of the concrete base cleared of construction debris and dust.
- Photos of the laid soundproofing material (e.g., "Shumanet" or equivalent) with taped joints.
- Photos of the perimeter of all rooms with secured damping tape.
- Photos of the laid reinforcing mesh (if wet screed is used).

**Instrumental inspection:**
- Visual inspection, tape measure.

**Control points for Technical Supervision (Yes/No):**

- [ ] The base is completely cleared of debris; cable routes and pipes on the floor are securely fastened and not "hanging" in the air.
- [ ] Damping tape (8–10 mm thick) is laid along the entire perimeter of the rooms, and is also wrapped around all heating and water pipes coming up from the floor.
- [ ] Soundproofing sheets are laid overlapping (or butt-joined with reinforced tape), with no tears or gaps through which mortar could seep to the floor slab.
- [ ] Engineering utilities (pipes) do not cross each other vertically in critical areas (otherwise the screed over them will be too thin and will crack).

---

### Sub-stage 4.2: Screed Pouring (Master: Screed Layer / Semi-Dry Screed Team)

Modern renovations typically use a semi-dry mechanized screed, as it provides a perfectly level surface and dries faster.

**Photo report from the master:**

- Photos of the finished screed covered with polyethylene film (for proper strength gain and moisture retention).
- Photos of cut expansion joints.

**Instrumental inspection:**
- Straightedge (2m), laser line generator, tape measure.

**Control points for Technical Supervision (Yes/No):**

- [ ] **Geometry:** Applying a 2-meter straightedge in different directions shows a gap of no more than 2 mm (critical for laying quartz vinyl, laminate, or large-format tiles).
- [ ] **Level:** The finished screed mark strictly corresponds to the design height, accounting for the future floor covering thickness (e.g., exactly 15 mm has been left for engineered hardwood and adhesive).
- [ ] Multi-level screed (if the project has a junction between tiles and laminate of different thicknesses) has been made with the exact height difference per design.
- [ ] Expansion (shrinkage) joints are cut in doorways and in rooms with an area of more than 20 sq.m. (prevents random cracking of the screed).
- [ ] The screed surface is dense, does not crumble underfoot, and has no loose areas.
- [ ] Walls (plastered at the previous stage) are not splashed with screed mortar; the damping tape protrudes above the floor level.

---

## Stage 5: Pre-Finish Preparation (White Box)

### Sub-stage 5.1: Installation of Drywall Structures (Master: Drywall Installer)

Ceilings, boxing structures, niches for concealed curtain rods. Must be submitted for acceptance in two phases: first the concealed frame, then the cladding.

**Photo report from the master (task completion blocker):**

- Photos of the assembled metal frame before drywall cladding.
- Photos of installed plywood backing plates (for future wardrobes, heavy chandeliers, or TVs).
- Photos of the finished structures after cladding (separately: shadow joint nodes at walls).

**Instrumental inspection:**
- Laser level, tape measure, straightedge (2m).

**Control points for Technical Supervision (Yes/No):**

- [ ] The spacing of the load-bearing ceiling profile is strictly 400 mm (standard for reliability for painting).
- [ ] Backing elements are installed in all locations specified in the technical design and are securely fastened.
- [ ] Drywall sheets are installed in a staggered pattern (joints do not form crosses); factory edges are chamfered at 22.5 degrees for filler compound.
- [ ] No hanging joints: all sheet connections fall strictly on a metal profile.
- [ ] Shadow profiles (ceiling or skirting) are set in a single plane without level differences at joints; corners are mitered at 45 degrees.

---

### Sub-stage 5.2: Installation of Concealed Door Frames (Master: Door Installer)

In minimalist renovations, flush-mount doors are installed before painting, so that painters can bring the wall to the same level as the frame.

**Photo report from the master:**

- Photos of the installed frame with spreader bars inserted.
- Photos of the laser level projecting the plane of the wall and frame.

**Instrumental inspection:**
- Laser line generator, spirit level, tape measure.

**Control points for Technical Supervision (Yes/No):**

- [ ] The aluminum door frame is set strictly in the same plane as the plastered wall (deviation 0 mm).
- [ ] The frame is set strictly vertical in all planes.
- [ ] The correct gap from the bottom edge of the frame to the finished floor level has been maintained (accounting for floor covering thickness).
- [ ] The gap between the frame and the wall is tightly and evenly filled with mounting foam.

---

### Sub-stage 5.3: Painting Preparation Works (Master: Painter)

The longest and most demanding stage. Accepted using strict quality criteria (Q4 standard).

**Photo report from the master:**

- Photos of patched drywall joints using reinforcing paper tape (not fiberglass mesh!).
- Photos of applied non-woven fabric on all walls and ceilings (protection against micro-cracks).
- Photos of installed metal or plastic corner protection profiles on all external corners.

**Instrumental inspection:**
- **Painter's inspection lamp (oblique lighting lamp)** — mandatory tool; straightedge (2m).

**Control points for Technical Supervision (Yes/No):**

- [ ] External corners (window reveals, boxing) are perfectly straight; profiles do not protrude beyond the wall plane; angle is strictly 90 degrees.
- [ ] Wall-to-ceiling and wall-to-floor junction lines are brought to a perfect 90-degree line (critical for installing concealed skirting and shadow ceilings).
- [ ] **Oblique light check:** When directing the inspection lamp parallel to the wall/ceiling surface, no dips, bumps, deep sanding scratches, or filler drips are visible. The surface is uniform.
- [ ] Window reveals are prepared for painting; planes are even, reveal angles are identical on both sides.
- [ ] Rooms are fully cleared of painting dust; walls are primed and ready for the final coat (paint).

---

## Stage 6: Finish Coating

### Sub-stage 6.1: Tile Laying (Master: Tiler)

The most expensive type of finish. The system must record tile adhesive and grout consumption.

**Photo report from the master (task completion blocker):**

- Photos of the "dry" layout of the first row (agreeing on the pattern and cuts).
- Photos of applied waterproofing (if not submitted at the rough plumbing stage).
- Photos of joints cleaned of adhesive before applying epoxy or cement grout.
- Photos of used packaging (adhesive bags, grout containers) for cross-checking consumption against the unit estimate.

**Instrumental inspection:**
- Laser line generator, straightedge (2m), construction square, feeler gauge.

**Control points for Technical Supervision (Yes/No):**

- [ ] Deviation of the laid tile plane does not exceed 1.5 mm per 2 meters (verified with a straightedge along all diagonals).
- [ ] Narrow cuts (less than 5 cm) are absent in visible areas; layout is symmetrical (according to the design).
- [ ] All external corners (boxing, niches) are done strictly by 45-degree mitering; no chips on the enamel.
- [ ] Tile joints are uniform (standard 1–1.5 mm); spacers and leveling systems (tile leveling clips) are fully removed.
- [ ] Grout is applied evenly, without gaps, voids, or drips onto the tile surface. Epoxy grout has been cleaned without residue (tile surface is not sticky).
- [ ] When tapped with a rubber mallet, no hollow sounds are detected over the entire area.

---

### Sub-stage 6.2: Painting of Walls and Ceilings (Master: Painter)

Paint is applied only after the property has been fully de-dusted.

**Photo report from the master:**

- Photos of windows, the entrance door, and concealed door frames covered with protective film (protection from splatter).
- Photos of empty paint containers (consumption control).

**Instrumental inspection:**
- Inspection lamp (oblique light).

**Control points for Technical Supervision (Yes/No):**

- [ ] Surface is painted evenly; missed spots, roller stripes, and stains are absent (verified under inspection light).
- [ ] No stuck debris, roller fibers, or paint drips on the painted surface.
- [ ] The junction line between two different colors (e.g., ceiling/wall) is perfectly straight, without bleed-through (verified from a distance of 1 meter).

---

### Sub-stage 6.3: Floor Covering Installation (Master: Installer)

Laminate, quartz vinyl, or engineered hardwood.

**Photo report from the master:**

- Photos of the cleaned screed and laid underlayment with taped joints.
- Detailed photos of expansion gaps along the wall perimeter.

**Control points for Technical Supervision (Yes/No):**

- [ ] Floor covering is laid without thresholds as a single continuous field (if permitted by the area and manufacturer's regulations).
- [ ] A technical expansion gap (usually 8–10 mm) has been maintained along the entire perimeter at walls, pipes, and built-in furniture.
- [ ] Walking on the surface produces no squeaks, crunching, or deflection (lock joint is not broken; screed is level).
- [ ] The pattern (wood texture) is distributed randomly; no unnatural repetitions of identical planks side by side.

---

## Stage 7: Finish Installation (Engineering Networks and Hardware)

After all dusty and wet work is completed, the system automatically invites electricians and plumbers to the property for installation of face hardware.

### Sub-stage 7.1: Finish Electrical Work (Master: Electrician)

**Control points (Yes/No):**

- [ ] Socket and switch faceplates fit tightly against the wall with no gaps.
- [ ] Mechanisms are installed strictly horizontal (verified with a mini-level).
- [ ] All light fixtures are connected and operational.
- [ ] The electrical panel is fully assembled; front covers are installed; final circuit breaker labels are applied. RCD/RCBO test button operation has been verified.

---

### Sub-stage 7.2: Finish Plumbing (Master: Plumber)

**Control points (Yes/No):**

- [ ] Wall-hung toilet, basins, and shower systems are installed strictly level.
- [ ] Chrome/matte black parts of mixers have no wrench scratches (installation was performed with the proper tool).
- [ ] All wet areas (bathtub/basin-to-tile junction) are treated with sanitary sealant; the bead is even, without gaps.
- [ ] Water has been run for 10 minutes at all points: no leaks under basins or the bathtub; water drains quickly (slopes are correct).

---

## Stage 8: Cleaning and Final Acceptance (Unit Closing)

This is the exit point from the pipeline. The property is transferred from production status to handover-ready status.

### Sub-stage 8.1: Professional Cleaning (Contractor: Cleaning Company)

The system will not pass the property to the final stage without cleanliness.

- [ ] Construction dust has been completely removed from all surfaces, including the inner parts of heating radiators and the top edges of doors.
- [ ] Windows, mirrors, and glass shower partitions have been washed without streaks.
- [ ] No traces of construction compounds, tape, or paint on windows or tiles.

---

### Sub-stage 8.2: Final Audit and Financial Closing (Manager / Chief Technical Supervisor)

This is a system step within the ERP that records the success of the production cycle.

**Actions in the system:**

1. **Portfolio formation:** Uploading final professional photos of the finished renovation to the property card.

2. **Defect summary:** The ERP analyzes the number of returns (defects) at each stage and automatically adjusts the internal master ratings.

3. **Unit economics recording:** The system consolidates all transactions (material costs, paid master wages, transportation expenses) and outputs the final project profitability. If the cost has been kept within $230/unit — green marker.

4. **Acceptance and handover certificate:** Automatic generation of a document for signing.

5. **Status change:** Pressing the "Property Successfully Completed" button. The pipeline cycle is finished.

All of this goes into the data archive.
