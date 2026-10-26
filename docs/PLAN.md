# v1 Plan — diagrams

Visual companion to [`ROADMAP.md`](../ROADMAP.md). All references use
`repo#issue` — e.g. `lumen-cli#3`, `create-lumen#13`. All diagrams render
on GitHub.

## 1. Functional milestones

```mermaid
flowchart LR
    M1["🧱 M1 · v1.0.0-alpha.1<br/>Core: CLI + config + create/init"]
    M2["🏗️ M2 · v1.0.0-alpha.2<br/>Generators"]
    M3["🎨 M3 · v1.0.0-beta.1<br/>UI registry"]
    M4["📚 M4 · v1.0.0-beta.2<br/>Docs engine"]
    M5["🩺 M5 · v1.0.0<br/>Doctor, barrels &amp; docs"]

    M1 -->|"npx @lumen-sh/cli create my-app"| M2
    M2 -->|"lumen g &lt;artifact&gt; writes files"| M3
    M3 -->|"g ui resolves Registry/shadcn"| M4
    M4 -->|"docs generation works"| M5
    M5 -->|"v1.0.0 usable"| DONE(((✅)))
```

## 2. Target command surface

What the CLI exposes at `v1.0.0` (a command appears as its milestone
lands).

```mermaid
flowchart TD
    Lumen["lumen"]
    Lumen --> Create["create / init<br/>M1 · delegate to create-lumen@^2"]
    Lumen --> Config["config<br/>M1"]
    Lumen --> Generate["generate / g<br/>M2"]
    Lumen --> Doctor["doctor<br/>M5"]
    Lumen --> Sync["sync-barrels<br/>M5"]

    Generate --> Feature["g feature<br/>M2"]
    Generate --> Page["g page<br/>M2"]
    Generate --> Service["g service<br/>M2"]
    Generate --> Store["g store<br/>M2"]
    Generate --> Form["g form<br/>M2"]
    Generate --> Ui["g ui &amp; g ui theme-*<br/>M3"]
```

## 3. Dependency graph (lumen-cli + cross-repo)

Solid = hard dependency. Dotted = dependency on `create-lumen`.

```mermaid
flowchart TD
    subgraph LC["lumen-cli v1"]
        direction TB
        LumenCli1["lumen-cli#1 · bootstrap"]
        LumenCli2["lumen-cli#2 · command framework"]
        LumenCli3["lumen-cli#3 · config reader"]
        LumenCli4["lumen-cli#4 · lumen config"]
        LumenCli5["lumen-cli#5 · create/init"]
        LumenCli6["lumen-cli#6 · forward flags"]
        LumenCli7["lumen-cli#7 · generator core"]
        LumenCli8["lumen-cli#8 · g feature"]
        LumenCli11["lumen-cli#11 · g page"]
        LumenCli12["lumen-cli#12 · g service"]
        LumenCli13["lumen-cli#13 · g store"]
        LumenCli14["lumen-cli#14 · g form"]
        LumenCli9["lumen-cli#9 · g ui"]
        LumenCli10["lumen-cli#10 · themes"]
        LumenCli24["lumen-cli#24 · port documentador"]
        LumenCli16["lumen-cli#16 · python bridge"]
        LumenCli15["lumen-cli#15 · api keys"]
        LumenCli17["lumen-cli#17 · TSDoc"]
        LumenCli18["lumen-cli#18 · wiki"]
        LumenCli19["lumen-cli#19 · --readme"]
        LumenCli25["lumen-cli#25 · co-located docs"]
        LumenCli20["lumen-cli#20 · doctor"]
        LumenCli21["lumen-cli#21 · sync-barrels"]
        LumenCli22["lumen-cli#22 · docs: README + command ref"]
        LumenCli23["lumen-cli#23 · backlog v1.0.0 (umbrella)"]

        LumenCli1 --> LumenCli2
        LumenCli2 --> LumenCli3 --> LumenCli7
        LumenCli3 --> LumenCli4
        LumenCli2 --> LumenCli5 --> LumenCli6
        LumenCli7 --> LumenCli8
        LumenCli7 --> LumenCli11
        LumenCli7 --> LumenCli12
        LumenCli7 --> LumenCli13
        LumenCli7 --> LumenCli14
        LumenCli7 --> LumenCli9 --> LumenCli10
        LumenCli7 --> LumenCli21
        LumenCli3 --> LumenCli20
        LumenCli7 --> LumenCli20
        LumenCli24 --> LumenCli16
        LumenCli16 --> LumenCli15
        LumenCli16 --> LumenCli17
        LumenCli16 --> LumenCli18
        LumenCli16 --> LumenCli19
        LumenCli16 --> LumenCli25
        LumenCli21 --> LumenCli22
        LumenCli21 --> LumenCli23
    end

    subgraph CLEX["create-lumen v2 (external)"]
        direction TB
        CreateLumen9["create-lumen#9 · shared contract"]
        CreateLumen13["create-lumen#13 · nested schema"]
        CreateLumen33["create-lumen#33 · shadcn/ui"]
        CreateLumenM1["create-lumen M1 · core (alpha)"]
    end

    CreateLumen9 -.-> LumenCli3
    CreateLumen13 -.-> LumenCli3
    CreateLumen33 -.-> LumenCli9
    CreateLumenM1 -.-> LumenCli5
```

## 4. Cross-project waves (4 devs)

Everything in a wave can run at the same time; lanes are shared with
`create-lumen`.

```mermaid
flowchart TB
    subgraph W0["🌊 Wave 0 — start now (fully parallel)"]
        direction LR
        LaneA["Lane A<br/>create-lumen manifest core<br/>create-lumen#13 #14 #15 #16 #4<br/>#9 #25 ✅ unblocked (#13)<br/>#17 #29 ✅ unblocked (#16)"]
        LaneB["Lane B<br/>create-lumen templates / tooling<br/>create-lumen#6 #24"]
        LaneC["Lane C<br/>lumen-cli skeleton<br/>lumen-cli#1 #2"]
        LaneD["Lane D<br/>lumen-cli docs-engine port<br/>lumen-cli#24 #16"]
        LaneG["Lane G<br/>testing strategy<br/>create-lumen#35 #36 #37 #28 #5"]
    end

    subgraph W1["🌊 Wave 1"]
        direction LR
        LaneE["Lane E<br/>create-lumen engine + options<br/>create-lumen#25 #26 #27 #33 #34 #11"]
        LaneH["Lane H<br/>lumen-cli generators<br/>lumen-cli#7 #8 #11–#14"]
    end

    subgraph W2["🌊 Wave 2"]
        direction LR
        LaneF["Lane F<br/>create-lumen Next.js<br/>create-lumen#8 #18–#22"]
        LaneI["Lane I<br/>lumen-cli UI registry<br/>lumen-cli#9 #10"]
        LaneJ["Lane J<br/>lumen-cli docs engine features<br/>lumen-cli#15 #17–#19 #25"]
        LaneK["Lane K<br/>lumen-cli doctor / barrels<br/>lumen-cli#20 #21"]
    end

    subgraph W3["🌊 Wave 3 — release"]
        LaneL["Lane L<br/>release &amp; docs<br/>create-lumen#17 #30 · lumen-cli#22"]
    end

    LaneA --> LaneE --> LaneF
    LaneC --> LaneH
    LaneH --> LaneI
    LaneH --> LaneK
    LaneD --> LaneJ
    LaneG -.-> LaneL
    LaneF --> LaneL
    LaneI --> LaneL
    LaneJ --> LaneL
    LaneK --> LaneL
```

Suggested split: **Dev 1** A→E→F · **Dev 2** B→G→L · **Dev 3**
C→H→I→K · **Dev 4** D→J.

## 5. Docs-engine pipeline (M4)

```mermaid
flowchart LR
    Source[("project source")] --> Scan["scan (parallel)<br/>LOC / stack / graph"]
    Scan --> Metrics["metrics<br/>McCabe (Python)"]
    Scan --> Secrets["secret / TODO scan"]
    Metrics --> Mode{"mode"}
    Secrets --> Mode
    Mode -->|"co-located"| Co["docs beside source<br/>lumen-cli#25"]
    Mode -->|"wiki"| Wiki["docs/wiki/*.md<br/>lumen-cli#18"]
    Mode -->|"readme"| Readme["README.md update<br/>lumen-cli#19"]
    Llm["Gemini (bridge lumen-cli#16)"] -.-> Co
    Llm -.-> Wiki
    Llm -.-> Readme
    Key[["API key lumen-cli#15"]] -.-> Llm
    Base["ported documentador lumen-cli#24"] --- Scan
```

## 6. Release train & cross-project ordering

```mermaid
graph LR
    A["create-lumen<br/>v2.0.0-alpha (M1)"] --> B["create-lumen<br/>alpha.2 → rc"]
    A -. "unblocks lumen-cli#3, lumen-cli#5" .-> C["lumen-cli<br/>v1.0.0-alpha (M1)"]
    C --> D["lumen-cli<br/>alpha.2 → beta.2"]
    B --> E["create-lumen<br/>v2.0.0"]
    D --> F["lumen-cli<br/>v1.0.0"]
    E -. "contract stable" .-> F
```
