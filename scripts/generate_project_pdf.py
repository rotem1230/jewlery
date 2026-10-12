#!/usr/bin/env python3
"""Generate the Malinvosky / Tsila full project PDF."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Malinvosky_Project_Document.pdf"

# Core PDF fonts only (Helvetica/Courier). Embedded TTF (Calibri/Segoe) uses
# Identity-H CID encoding that Cursor's PDF.js viewer often cannot open.
_LATIN1_MAP = str.maketrans(
    {
        "\u2014": "-",  # em dash
        "\u2013": "-",  # en dash
        "\u00b7": "|",  # middle dot
        "\u2022": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u2265": ">=",
        "\u20aa": "NIS",
    }
)


def latin1(text: str) -> str:
    return text.translate(_LATIN1_MAP).encode("latin-1", "replace").decode("latin-1")

BRAND = (89, 87, 191)
BRAND_DARK = (74, 72, 168)
NAVY = (1, 43, 66)
INK = (27, 27, 35)
MUTED = (118, 118, 134)
LINE = (232, 232, 232)
LIGHT = (237, 243, 250)
WHITE = (255, 255, 255)
ROW_ALT = (247, 248, 252)
GREEN = (21, 128, 94)
AMBER = (180, 110, 20)


class ProjectPDF(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4", unit="mm")
        self.set_title("Malinvosky / Tsila - Full Project Document")
        self.set_author("Malinvosky Engineering")
        self.set_creator("Malinvosky project documentation generator")
        self.set_subject("3D jewelry design and designer-jeweler marketplace")
        self.set_keywords("Malinvosky, Tsila, jewelry, 3D, marketplace, NestJS, React Native")
        self.set_lang("en")
        self.set_auto_page_break(auto=True, margin=22)
        self.set_margins(18, 20, 18)
        self.cover_mode = True
        self.section_title = ""

    def header(self) -> None:
        if self.cover_mode or self.page_no() == 1:
            return
        self.set_fill_color(*BRAND)
        self.rect(0, 0, 210, 8, "F")
        self.set_xy(18, 10)
        self.set_font("helvetica", "B", 8)
        self.set_text_color(*BRAND)
        self.cell(90, 5, "MALINVOSKY  /  TSILA", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(84, 5, latin1(self.section_title), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(18, 16.5, 192, 16.5)
        self.set_y(20)

    def footer(self) -> None:
        if self.cover_mode or self.page_no() == 1:
            return
        self.set_y(-16)
        self.set_draw_color(*LINE)
        self.line(18, self.get_y(), 192, self.get_y())
        self.set_y(-13)
        self.set_font("helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(80, 6, "Internal project document  |  14 September 2026", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(94, 6, f"Page {self.page_no() - 1}", align="R")

    def set_section(self, title: str) -> None:
        self.section_title = title

    def h1(self, text: str) -> None:
        if self.get_y() > 250:
            self.add_page()
        self.set_font("helvetica", "B", 18)
        self.set_text_color(*NAVY)
        self.ln(3)
        self.multi_cell(0, 9, latin1(text))
        self.set_fill_color(*BRAND)
        y = self.get_y()
        self.rect(18, y + 1, 22, 1.2, "F")
        self.ln(8)

    def h2(self, text: str) -> None:
        if self.get_y() > 255:
            self.add_page()
        self.ln(2)
        self.set_font("helvetica", "B", 13)
        self.set_text_color(*BRAND_DARK)
        self.multi_cell(0, 7, latin1(text))
        self.ln(2)

    def h3(self, text: str) -> None:
        if self.get_y() > 258:
            self.add_page()
        self.set_font("helvetica", "B", 11.5)
        self.set_text_color(*NAVY)
        self.multi_cell(0, 6, latin1(text))
        self.ln(1)

    def p(self, text: str) -> None:
        self.set_font("helvetica", "", 10.5)
        self.set_text_color(*INK)
        self.multi_cell(0, 5.4, latin1(text))
        self.ln(2.2)

    def italic(self, text: str) -> None:
        self.set_font("helvetica", "I", 10)
        self.set_text_color(*MUTED)
        self.multi_cell(0, 5.2, latin1(text))
        self.ln(2)

    def bullets(self, items: list[str]) -> None:
        self.set_font("helvetica", "", 10.5)
        self.set_text_color(*INK)
        for item in items:
            x = self.get_x()
            y = self.get_y()
            if y > 270:
                self.add_page()
                x = self.get_x()
                y = self.get_y()
            self.set_fill_color(*BRAND)
            self.ellipse(x + 1.2, y + 1.8, 1.6, 1.6, "F")
            self.set_xy(x + 6, y)
            self.multi_cell(168, 5.3, latin1(item))
            self.ln(1)
        self.ln(1.5)

    def numbered(self, items: list[str]) -> None:
        self.set_font("helvetica", "", 10.5)
        self.set_text_color(*INK)
        for i, item in enumerate(items, 1):
            if self.get_y() > 270:
                self.add_page()
            self.set_font("helvetica", "B", 10.5)
            self.set_text_color(*BRAND)
            x = self.get_x()
            y = self.get_y()
            self.cell(8, 5.3, f"{i}.")
            self.set_xy(x + 8, y)
            self.set_font("helvetica", "", 10.5)
            self.set_text_color(*INK)
            self.multi_cell(166, 5.3, latin1(item))
            self.ln(1)
        self.ln(1.5)

    def callout(self, title: str, body: str, color: tuple[int, int, int] = BRAND) -> None:
        if self.get_y() > 245:
            self.add_page()
        x, y = 18, self.get_y()
        self.set_font("helvetica", "B", 10)
        title_h = 6
        self.set_font("helvetica", "", 10)
        body_h = self.multi_cell(162, 5.2, latin1(body), dry_run=True, output="HEIGHT")
        h = title_h + body_h + 8
        self.set_fill_color(*LIGHT)
        self.set_draw_color(*color)
        self.set_line_width(0.4)
        self.rect(x, y, 174, h, "FD")
        self.set_fill_color(*color)
        self.rect(x, y, 2.2, h, "F")
        self.set_xy(x + 8, y + 3)
        self.set_font("helvetica", "B", 10)
        self.set_text_color(*color)
        self.cell(160, 5, latin1(title))
        self.set_xy(x + 8, y + 9)
        self.set_font("helvetica", "", 10)
        self.set_text_color(*INK)
        self.multi_cell(162, 5.2, latin1(body))
        self.set_y(y + h + 4)

    def code(self, text: str) -> None:
        if self.get_y() > 250:
            self.add_page()
        x, y = 18, self.get_y()
        h = self._code_height(text) + 8
        if y + h > 275:
            self.add_page()
            x, y = 18, self.get_y()
        self.set_fill_color(28, 32, 48)
        self.rect(x, y, 174, h, "F")
        self.set_xy(x + 5, y + 4)
        self.set_font("courier", "", 8)
        self.set_text_color(230, 232, 240)
        self.multi_cell(164, 4.2, latin1(text))
        self.set_y(y + h + 4)

    def _code_height(self, text: str) -> float:
        self.set_font("courier", "", 8)
        return max(8.0, self.multi_cell(164, 4.2, latin1(text), dry_run=True, output="HEIGHT"))

    def grid(self, headers: list[str], rows: list[list[str]], col_widths: list[float] | None = None) -> None:
        if self.get_y() > 250:
            self.add_page()
        headings = FontFace(family="helvetica", emphasis="BOLD", size_pt=9, color=WHITE, fill_color=NAVY)
        striped = FontFace(family="helvetica", emphasis="", size_pt=9, color=INK, fill_color=ROW_ALT)
        normal = FontFace(family="helvetica", emphasis="", size_pt=9, color=INK, fill_color=WHITE)
        with self.table(
            col_widths=col_widths,
            text_align="LEFT",
            line_height=5.4,
            padding=2.2,
            headings_style=headings,
            first_row_as_headings=True,
            markdown=False,
            borders_layout="SINGLE_TOP_LINE",
            v_align="TOP",
        ) as table:
            row = table.row()
            for h in headers:
                row.cell(latin1(h))
            for i, cells in enumerate(rows):
                row = table.row(style=striped if i % 2 else normal)
                for c in cells:
                    row.cell(latin1(c))
        self.ln(5)


def draw_cover(pdf: ProjectPDF) -> None:
    pdf.add_page()
    pdf.cover_mode = True
    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 0, 210, 297, "F")
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, 12, 297, "F")
    pdf.set_fill_color(*BRAND_DARK)
    pdf.rect(12, 0, 2, 297, "F")

    pdf.set_xy(32, 38)
    pdf.set_font("helvetica", "", 11)
    pdf.set_text_color(180, 186, 230)
    pdf.cell(0, 8, "PRODUCT  |  ENGINEERING  |  OPERATIONS")

    pdf.set_xy(32, 58)
    pdf.set_font("helvetica", "B", 36)
    pdf.set_text_color(*WHITE)
    pdf.multi_cell(150, 16, "Malinvosky")
    pdf.set_x(32)
    pdf.set_font("helvetica", "", 22)
    pdf.set_text_color(196, 198, 240)
    pdf.cell(0, 12, "Tsila Jewelry Platform")

    pdf.set_fill_color(*BRAND)
    pdf.rect(32, 112, 36, 2.2, "F")

    pdf.set_xy(32, 124)
    pdf.set_font("helvetica", "B", 16)
    pdf.set_text_color(*WHITE)
    pdf.multi_cell(150, 8, "Full Project Document")
    pdf.set_xy(32, 140)
    pdf.set_font("helvetica", "", 12)
    pdf.set_text_color(210, 214, 230)
    pdf.multi_cell(
        150,
        6.2,
        latin1(
            "3D jewelry design studio and designer-jeweler marketplace. "
            "This document describes the product, architecture, data model, "
            "APIs, mobile app, 3D studio, billing, security, local setup, "
            "and current implementation status."
        ),
    )

    facts = [
        ("Version", "1.0"),
        ("Date", "14 September 2026"),
        ("Status", "Phase 1 MVP complete"),
        ("Audience", "Product, engineering, stakeholders"),
    ]
    y = 198
    for label, value in facts:
        pdf.set_xy(32, y)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(160, 168, 200)
        pdf.cell(40, 6, label.upper())
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(*WHITE)
        pdf.cell(80, 6, value)
        y += 10

    pdf.set_auto_page_break(auto=False)
    pdf.set_xy(32, 258)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(160, 168, 200)
    pdf.cell(0, 5, "Working titles: Malinvosky  |  Tsila  |  3D Project")
    pdf.set_xy(32, 264)
    pdf.cell(0, 5, "Confidential - for internal project use")
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.cover_mode = False


def build(pdf: ProjectPDF) -> None:
    pdf.set_section("Contents")
    pdf.add_page()
    pdf.h1("Contents")
    toc = [
        ("1", "Document control"),
        ("2", "Executive summary"),
        ("3", "Product overview"),
        ("4", "Business goals and success metrics"),
        ("5", "Personas, roles, and permissions"),
        ("6", "User journeys"),
        ("7", "System architecture"),
        ("8", "Technology stack"),
        ("9", "Repository and runtime layout"),
        ("10", "Mobile application"),
        ("11", "Backend platform"),
        ("12", "Data model"),
        ("13", "3D Design Studio"),
        ("14", "Atelier marketplace"),
        ("15", "Chat, quotes, and handoff"),
        ("16", "Subscriptions, entitlements, and billing"),
        ("17", "Master data, CMS, and admin"),
        ("18", "Security, privacy, and compliance"),
        ("19", "Integrations and jobs"),
        ("20", "Local development and operations"),
        ("21", "Implementation status"),
        ("22", "Roadmap and remaining work"),
        ("23", "Risks and open decisions"),
        ("24", "Glossary"),
        ("A", "Appendix - API catalog"),
        ("B", "Appendix - Screen map"),
        ("C", "Appendix - Seed and configuration"),
    ]
    pdf.set_font("helvetica", "", 11)
    for num, title in toc:
        if pdf.get_y() > 272:
            pdf.add_page()
        pdf.set_text_color(*BRAND)
        pdf.set_font("helvetica", "B", 11)
        pdf.cell(12, 7, num)
        pdf.set_text_color(*INK)
        pdf.set_font("helvetica", "", 11)
        pdf.cell(0, 7, latin1(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # 1
    pdf.set_section("1. Document control")
    pdf.add_page()
    pdf.h1("1. Document control")
    pdf.p(
        "This is the full project document for Malinvosky (product name Tsila): "
        "a mobile-first 3D jewelry design platform and designer–jeweler marketplace. "
        "It consolidates the approved PRD (8 July 2026), the implemented NestJS + Prisma backend, "
        "the React Native app, and the 3D studio playbook as of 14 September 2026."
    )
    pdf.grid(
        ["Field", "Value"],
        [
            ["Document title", "Malinvosky / Tsila — Full Project Document"],
            ["Version", "1.0"],
            ["Date", "14 September 2026"],
            ["Product owner", "Keren Chori"],
            ["PRD author", "Aviel Shemlov"],
            ["Codebase", "D:\\Projects\\Malinvosky (backend + app monorepo)"],
            ["Primary sources", "PRD, docs/backend-plan.md, docs/backend-contracts.md, Prisma schema, app navigation"],
            ["Classification", "Internal"],
        ],
        [48, 126],
    )
    pdf.h2("1.1 Purpose")
    pdf.bullets(
        [
            "Give product, design, and engineering a single baseline of what the platform is and how it works today.",
            "Describe implemented modules, frozen API contracts, and feature flags for later phases.",
            "Serve as onboarding material for new engineers and a briefing pack for stakeholders.",
            "Record remaining product decisions without mixing them into shipping contracts.",
        ]
    )
    pdf.h2("1.2 Related documents")
    pdf.grid(
        ["Document", "Role"],
        [
            ["PRD_Tsila_Jewelry_Platform_EN", "Product requirements, Figma audit (82 screens), sprint plan"],
            ["docs/backend-plan.md", "Phase status and module map"],
            ["docs/backend-contracts.md", "Frozen entitlements, config keys, events, flags"],
            ["docs/phase1-exit-gate.md", "Phase 1 completion checklist"],
            ["docs/3d-studio-guide.md", "Studio architecture: local params vs Tripo vs visualization"],
            ["docs/local-development.md", "Ports, seed users, theme tokens"],
            ["Swagger /api/v1/docs", "Live OpenAPI for the running API"],
        ],
        [62, 112],
    )

    # 2
    pdf.set_section("2. Executive summary")
    pdf.add_page()
    pdf.h1("2. Executive summary")
    pdf.p(
        "Malinvosky connects jewelry designers (professionals and hobbyists) with jewelers and goldsmiths. "
        "A designer creates a piece in a guided 3D studio, publishes it or requests specific jewelers, "
        "compares quotes in chat, and then continues production off-platform. A jeweler runs a business "
        "profile, receives work, submits structured quotes, and tracks orders."
    )
    pdf.p(
        "Phase 0 foundation and Phase 1 MVP are implemented. Phase 2 (personal visualization ranker, "
        "promotions, matching/CRM) exists behind flags that default off. Phase 3 (OAuth completion, "
        "PostGIS geo search, in-app jewelry payment intents) is stubbed and flagged off."
    )
    pdf.callout(
        "North-star flow",
        "Register and verify → create a design in the studio → publish or request jewelers → "
        "chat and quote → accept quote → contact handoff. Jewelry payment stays outside the app in Phase 1.",
    )
    pdf.h2("2.1 What is shipping today")
    pdf.bullets(
        [
            "Email/password auth with verification, reset, role switch, JWT access + rotating refresh tokens.",
            "Designer and jeweler shells with Hebrew-first UI, Figma brand #5957BF, Heebo type.",
            "Design CRUD, versions, lock, status machine, feasibility, duplicate.",
            "Local 3D studio (size, metal, setting, stone, elements, inspiration) with catalog GLBs.",
            "Atelier search (designs + jewelers), banners, quote requests, jeweler self-service profiles.",
            "REST + Socket.io chat, quote cards, accept/decline, system handoff message.",
            "Subscriptions, entitlements, leads, usage events, payment webhooks (provider-agnostic).",
            "Admin surfaces for master data, CMS, feature flags, promotions, gallery, feasibility.",
        ]
    )
    pdf.h2("2.2 Explicit non-goals for Phase 1")
    pdf.bullets(
        [
            "Building a custom 3D CAD engine. Size/metal/setting/stone stay local; AI generation is isolated.",
            "Taking payment for the physical jewelry piece inside the app.",
            "Live Tripo URLs in the viewer (they expire in five minutes; files must land in Uploads).",
            "Renaming or dropping frozen api/v1 contracts without expand-contract + ADR.",
        ]
    )

    # 3
    pdf.set_section("3. Product overview")
    pdf.add_page()
    pdf.h1("3. Product overview")
    pdf.h2("3.1 Positioning")
    pdf.p(
        "Tsila is a blended B2C/B2B product. Hobbyists get defaults, measurement guides, and a visual preview. "
        "Professional designers get lockable dimensions, manufacturability checks, and a channel to workshops. "
        "Jewelers get a Fiverr-like inbound board: portfolio, leads, quoting, and chat — not a generic social feed."
    )
    pdf.h2("3.2 Item types")
    pdf.p("The wizard is data-driven per item type. Seeded types:")
    pdf.grid(
        ["Code", "Size UX", "Notes"],
        [
            ["RING", "IL 52–64 / US / mm chart, then band width (default 3.0 mm)", "Band width vs setting is validated"],
            ["NECKLACE", "Fixed lengths 42 / 45 / 50 cm only", "No free-text length"],
            ["BRACELET", "Wrist circumference (e.g. 16.5 cm)", "Measurement guide in-app"],
            ["EARRINGS", "Style first (dangle / stud), then size", "Style is a pre-studio screen"],
        ],
        [32, 78, 64],
    )
    pdf.h2("3.3 Naming")
    pdf.p(
        "The repository and Docker stack use Malinvosky / mailnvosky. The product in Figma and the PRD is Tsila. "
        "The marketplace tab is Atelier (not the verbal nickname “Talia”). This document uses Malinvosky for the "
        "codebase and Tsila for the customer-facing product."
    )
    pdf.h2("3.4 Language and locale")
    pdf.p(
        "The app is Hebrew-first (RTL) with locale default he on user preferences. Master data stores Hebrew and "
        "English labels. Timezone default is Asia/Jerusalem. Copy in Figma is Hebrew; engineering docs are English."
    )

    # 4
    pdf.set_section("4. Business goals and KPIs")
    pdf.add_page()
    pdf.h1("4. Business goals and success metrics")
    pdf.h2("4.1 Business goals")
    pdf.numbered(
        [
            "Shorten the path from jewelry idea to a manufacturable spec and a willing jeweler.",
            "Make 3D jewelry design accessible to non-professionals without hiding precision tools.",
            "Give jewelers a real business surface: portfolio, inbound jobs, quotes, and lead quotas.",
            "Monetize via SaaS subscriptions, sponsored placements, and premium visualization — not jewelry escrow.",
        ]
    )
    pdf.h2("4.2 Revenue model")
    pdf.p(
        "Platform revenue is subscriptions (designer and jeweler plans), metered extras (pay-per-item, extra leads), "
        "and sponsored Atelier placements. Payment for the finished piece is coordinated after quote acceptance "
        "(WhatsApp / direct contact). In-app jewelry payment intents are a Phase 3 stub only."
    )
    pdf.h2("4.3 KPIs (PRD targets)")
    pdf.grid(
        ["Metric", "Definition", "Initial target"],
        [
            ["Activation rate", "Users who complete a first design within 7 days of sign-up", "≥ 35%"],
            ["Design-to-quote", "Published/requested designs that receive ≥ 1 jeweler quote", "≥ 40%"],
            ["Quote-to-deal", "Accepted quotes that become a real job (self-reported / off-app)", "≥ 20%"],
            ["Trial-to-paid", "Free trial converting to a paid plan", "10–15%"],
            ["Active jewelers", "Published profiles that respond within 48 hours", "Set per phase"],
            ["Personal visualization", "Share of users who trigger the premium try-on feature", "Monitor conversion"],
        ],
        [42, 88, 44],
    )
    pdf.callout(
        "Measurement caveat",
        "Because jewelry payment is outside the app, Quote-to-Deal is incomplete unless jewelers or designers "
        "self-report completion. Phase 1 tracks quote accept + handoff as the closest in-product proxy.",
        AMBER,
    )

    # 5
    pdf.set_section("5. Personas and roles")
    pdf.add_page()
    pdf.h1("5. Personas, roles, and permissions")
    pdf.h2("5.1 Jewelry designer")
    pdf.p(
        "Two sub-types share one DESIGNER role. Professionals need precise size, karat, setting, and lock. "
        "Hobbyists need defaults, measurement guides, and a live preview. Both need a trustworthy jeweler list, "
        "quote comparison, and a clear order conversation."
    )
    pdf.h2("5.2 Jeweler")
    pdf.p(
        "Workshop owner looking for inbound work and exposure. Needs a simple request board, portfolio, "
        "testimonials, region filter, and a structured quote form inside chat — not a CAD tool."
    )
    pdf.h2("5.3 System roles")
    pdf.grid(
        ["Role", "Primary permissions"],
        [
            ["DESIGNER", "Own designs, studio, gallery browse, Atelier jeweler search, chat, personal subscription"],
            ["JEWELER", "Business profile, orders board, quotes, Atelier jobs, chat, business subscription, CRM notes if entitled"],
            ["ADMIN", "Master data, CMS, flags, promotions, gallery, feasibility, jeweler approve/verify, health"],
        ],
        [36, 138],
    )
    pdf.p(
        "A user can hold multiple roles. activeRole selects the shell after login. POST /auth/switch-role flips "
        "the active role without a new account. JWT carries roles; RolesGuard enforces endpoint policy."
    )
    pdf.h2("5.4 Account lifecycle")
    pdf.grid(
        ["Status", "Meaning"],
        [
            ["PENDING_VERIFICATION", "Registered; email verify required before full access"],
            ["ACTIVE", "Normal use"],
            ["SUSPENDED", "Admin lock; sockets and login rejected"],
            ["DEACTIVATED", "Soft-deleted / closed account"],
        ],
        [52, 122],
    )

    # 6
    pdf.set_section("6. User journeys")
    pdf.add_page()
    pdf.h1("6. User journeys")
    pdf.h2("6.1 Designer — create and publish")
    pdf.numbered(
        [
            "Choose role → sign up / log in → email verify.",
            "Home: start a new design (hero) or open the curated gallery.",
            "Pick category (ring, earrings, necklace, bracelet). Earrings pick style first.",
            "Optional size/style screens, then Design Studio (six tabs) with live 3D preview.",
            "Lock size/thickness when prompted. PATCH parameters autosave; versions retained.",
            "Inspiration: upload photo/notes; optional Generate with AI (job → Uploads GLB).",
            "Close studio → try-on (paywalled), export STL/PNG_HD, or continue to design details.",
            "Draft: publish to marketplace and/or request jewelers (targeted or broadcast).",
            "Receive quotes in chat → open full offer → accept → system handoff message.",
        ]
    )
    pdf.h2("6.2 Jeweler — inbound job")
    pdf.numbered(
        [
            "Sign up as jeweler → create business profile draft → preview → publish (admin review flag may apply).",
            "Home / My Orders: New Requests and In Progress counters; tabs All / Quote submitted / Negotiating / Completed.",
            "Atelier Designs tab: browse published jobs, filter by region, open design, submit quote.",
            "Quote form: materials cost, labor, ETA business days; total computed.",
            "Negotiate in chat (text, image, voice, quote card). Designer accepts → handoff.",
            "Optional CRM notes on production status when jeweler_crm entitlement is present.",
        ]
    )
    pdf.h2("6.3 Design status machine")
    pdf.p("Server-enforced transitions (not only UI):")
    pdf.grid(
        ["From", "To", "Rule"],
        [
            ["DRAFT", "PUBLISHED", "May require feasibility approval if AppConfig.require_feasibility_before_publish"],
            ["DRAFT", "ARCHIVED", "Allowed"],
            ["PUBLISHED", "ARCHIVED", "Bidirectional with return to drafts"],
            ["ARCHIVED", "DRAFT", "Move back to drafts"],
            ["PUBLISHED", "COMPLETED", "Sets acceptedQuoteId and completedByJewelerId"],
            ["COMPLETED", "—", "Terminal except admin force"],
        ],
        [32, 36, 106],
    )
    pdf.p(
        "Marketplace listings can expire via marketplace_publish_ttl_days. Published cards show quote counts; "
        "completed cards show the jeweler who finished the piece."
    )

    # 7
    pdf.set_section("7. System architecture")
    pdf.add_page()
    pdf.h1("7. System architecture")
    pdf.p(
        "Phase 1 is a modular NestJS monolith, not microservices. One API process owns auth, designs, marketplace, "
        "chat, billing, jobs, and admin. PostgreSQL is the system of record. Redis backs cache, throttling-adjacent "
        "state, and BullMQ queues. Object storage holds images and 3D files (local stub or S3)."
    )
    pdf.code(
        "React Native app (iOS / Android)\n"
        "    REST  api/v1   +   Socket.io  /ws\n"
        "NestJS modular monolith\n"
        "    PostgreSQL 16     Redis 7 / BullMQ\n"
        "    Uploads (S3 or local)     Outbox processor\n"
        "Adapters: stub render engine, stub/sample AI (Tripo later), viz stub, payment webhooks"
    )
    pdf.h2("7.1 Request path")
    pdf.bullets(
        [
            "Helmet, CORS allow-list, body-size limit, ValidationPipe (whitelist + forbid unknown fields).",
            "Global JWT guard, RolesGuard, ThrottlerGuard (default 100 req / 60s).",
            "TransformInterceptor wraps success payloads; exception filters return { success:false, message, errors }.",
            "Idempotency keys on mutating marketplace/quote paths where double-submit is likely.",
            "Audit log + event log + transactional outbox for quote.accepted, design.published, handoff.created, jobs.",
        ]
    )
    pdf.h2("7.2 Real-time")
    pdf.p(
        "HTTP is the source of truth for messages. ChatGateway on namespace /ws authenticates the JWT, joins "
        "conversation rooms, and broadcasts message:new and message:read after ConversationsService writes. "
        "Clients must not treat the socket as a write API."
    )
    pdf.h2("7.3 Studio vs AI vs visualization vs export")
    pdf.grid(
        ["Surface", "Call", "Rule"],
        [
            ["Size / metal / setting / stone / elements", "PATCH /designs/:id { parameters }", "Local viewer only. Never Tripo."],
            ["Inspiration generate", "POST /ai/inspiration", "Download GLB into Uploads; poll GET /ai/jobs/:id"],
            ["Try-on selfie", "POST /visualization/jobs", "Entitlement personal_visualization; not Tripo"],
            ["Export STL / PNG_HD", "POST /render-jobs", "Watermark unless no_watermark; HD needs hd_export"],
        ],
        [52, 58, 64],
    )
    pdf.callout(
        "Architecture invariant",
        "The WebView 3D viewer loads only files we host (catalog GLBs or GET /uploads/:id/content). "
        "Do not point it at expiring vendor URLs.",
    )
    pdf.h2("7.4 Cross-cutting platform services")
    pdf.bullets(
        [
            "EntitlementsService: union of keys from ACTIVE / TRIALING / PAST_DUE subscriptions; assert() throws PAYWALL.",
            "StateMachineService: design and quote transitions.",
            "OutboxService + processor: reliable side effects (push, system messages, lead consumption).",
            "AppConfig + ContentPage: password policy, TTLs, home CMS blocks, FAQ/TOS/disclaimer without a release.",
            "Feature flags with optional audience (roles / plan codes) and rollout percent.",
        ]
    )

    # 8
    pdf.set_section("8. Technology stack")
    pdf.add_page()
    pdf.h1("8. Technology stack")
    pdf.h2("8.1 Backend")
    pdf.grid(
        ["Layer", "Choice"],
        [
            ["Runtime", "Node.js 20+ ; NestJS 11"],
            ["Language", "TypeScript 5.8"],
            ["ORM / DB", "Prisma 6 + PostgreSQL 16"],
            ["Cache / queue", "Redis 7, ioredis, BullMQ"],
            ["Auth", "Passport JWT, bcrypt, refresh-token families"],
            ["Realtime", "Socket.io (platform-socket.io / websockets)"],
            ["API docs", "Swagger at /api/v1/docs (non-production)"],
            ["Validation", "class-validator, class-transformer, AJV JSON Schema for design.parameters"],
            ["Security", "Helmet, CORS, throttling, RBAC"],
            ["Health", "NestJS Terminus"],
        ],
        [42, 132],
    )
    pdf.h2("8.2 Mobile app")
    pdf.grid(
        ["Layer", "Choice"],
        [
            ["Framework", "React Native CLI 0.86 (no Expo)"],
            ["UI", "React 19, NativeWind v4 / Tailwind 3, Figma tokens"],
            ["Navigation", "React Navigation 7 (native stack + bottom tabs)"],
            ["State", "Redux Toolkit"],
            ["3D preview", "Three.js inside react-native-webview; catalog .glb in app/assets/models/studio"],
            ["Media", "image-picker, audio-recorder-player, SVG"],
            ["Realtime client", "socket.io-client"],
            ["Node", "≥ 22.11 (nvm 24 recommended)"],
        ],
        [42, 132],
    )
    pdf.h2("8.3 Infrastructure (local)")
    pdf.p(
        "docker-compose.yml runs Postgres 16 Alpine on host 5433 and Redis 7 Alpine on host 6380. "
        "Production target in the PRD is containerized cloud (AWS/GCP/Azure) with CI/CD, Datadog/New Relic, "
        "and Sentry. That production topology is not defined as IaC in this repo yet."
    )

    # 9
    pdf.set_section("9. Repository layout")
    pdf.add_page()
    pdf.h1("9. Repository and runtime layout")
    pdf.code(
        "mailnvosky/\n"
        "├── backend/          NestJS API, Prisma, seed, e2e helper\n"
        "├── app/              React Native iOS + Android\n"
        "├── docs/             Contracts, studio guide, this PDF\n"
        "├── scripts/          PDF generator and tooling\n"
        "└── docker-compose.yml"
    )
    pdf.h2("9.1 Ports")
    pdf.grid(
        ["Service", "Port", "Notes"],
        [
            ["API", "3000", "http://localhost:3000/api/v1"],
            ["Swagger", "3000", "/api/v1/docs in development"],
            ["Postgres", "5433", "Avoids clashing with a local :5432"],
            ["Redis", "6380", "BullMQ + cache"],
            ["Metro", "8081", "React Native bundler; APP_URL default"],
        ],
        [36, 28, 110],
    )
    pdf.h2("9.2 Backend modules")
    pdf.p(
        "Auth, Users, Home, Designs, Gallery, Wizard, MasterData, Uploads, RenderJobs, AI, Atelier, "
        "JewelerProfiles, Reviews, Chat, Quotes, Notifications, Subscriptions, Visualization, Promotions, "
        "JewelryPayments, CMS, FeatureFlags, Admin, Jobs, Health, Mail, Redis, Audit, Outbox, Entitlements."
    )

    # 10
    pdf.set_section("10. Mobile application")
    pdf.add_page()
    pdf.h1("10. Mobile application")
    pdf.h2("10.1 Navigation shells")
    pdf.p(
        "RootNavigator switches on auth.user and activeRole. Unauthenticated users see AuthStack. "
        "DESIGNER sees five tabs; JEWELER sees four (My Orders replaces Home + My Designs)."
    )
    pdf.grid(
        ["Designer tabs", "Jeweler tabs"],
        [
            ["Home — hero, gallery, recent updates", "My Orders — new / in progress, request board"],
            ["My Designs — All / Drafts / Published / Completed / Archive", "Atelier — jobs + jewelers (self profile edit)"],
            ["Atelier — designs + jewelers", "Chats"],
            ["Chats", "Profile — settings, FAQ, TOS, pricing, business profile"],
            ["Profile — settings, FAQ, TOS, pricing", ""],
        ],
        [87, 87],
    )
    pdf.h2("10.2 Auth stack")
    pdf.p(
        "Splash → Role select → Login / Signup / Forgot password / Terms. Demo entry on Role Select "
        "opens tab shells without the API for UI work. Production path uses register, verify, login, refresh."
    )
    pdf.h2("10.3 Designer creation flow (Home stack)")
    pdf.p(
        "The wizard lives under Home so the tab bar stays on Home: CategorySelect → SizeSelect or StyleSelect → "
        "MeasurementGuide → DesignStudio(designId). My Designs only lists and opens DesignDetails. "
        "Details can reopen the studio via Edit in studio."
    )
    pdf.h2("10.4 Screen inventory (implemented)")
    pdf.grid(
        ["Area", "Screens"],
        [
            ["Auth", "Splash, RoleSelect, Login, Signup, ForgotPassword, Terms"],
            ["Designer", "DesignerHome, CategorySelect, SizeSelect, StyleSelect, MeasurementGuide, DesignStudio, MyDesigns, DesignDetails, Pricing"],
            ["Jeweler", "MyOrders, OrderDetails, BusinessProfileForm / Preview / View"],
            ["Shared", "Atelier, PublicDesign, JewelerProfile, AddRecommendation, SubmitQuote, QuoteDetails, Chats, ChatThread, Profile, Faq"],
        ],
        [32, 142],
    )
    pdf.h2("10.5 Theme")
    pdf.p(
        "Tokens in app/src/theme/tokens.ts and Tailwind preset. Brand primary #5957BF, auth/home backgrounds "
        "#EDF3FA / #EFF5FC, ink #1B1B23, navy #012B42. Font: Heebo as a licensed-Ploni substitute "
        "(fontFamily.brand). Generate a screen with npm run generate:screen."
    )
    pdf.h2("10.6 Client architecture notes")
    pdf.bullets(
        [
            "API modules under app/src/api wrap fetch with session tokens (AsyncStorage).",
            "StudioViewer injects HTML/Three.js; parameters mapped in studioParams.ts.",
            "Chat supports text, image, voice notes, quote cards, and an approve-success modal.",
            "BackendStatusBanner surfaces API unavailability during local development.",
        ]
    )

    # 11
    pdf.set_section("11. Backend platform")
    pdf.add_page()
    pdf.h1("11. Backend platform")
    pdf.h2("11.1 API conventions")
    pdf.bullets(
        [
            "Prefix api/v1 is stable through Phase 2. Enum values are append-only after Phase 1 exit.",
            "Design.parameters uses parametersSchemaVersion; validate against ItemTypeConfig.parametersSchema.",
            "UUIDs for public ids. Soft delete on users and designs (deletedAt).",
            "Optimistic concurrency via Design.version.",
            "Admin routes are separated (admin-*.controller.ts) and role-gated.",
        ]
    )
    pdf.h2("11.2 Auth endpoints")
    pdf.grid(
        ["Method", "Path", "Purpose"],
        [
            ["POST", "/auth/register", "Email, password, roles DESIGNER | JEWELER"],
            ["POST", "/auth/login", "Issues access + refresh; lockout after N failures"],
            ["POST", "/auth/refresh", "Rotate refresh family; reuse detection"],
            ["POST", "/auth/logout", "Revoke current refresh"],
            ["POST", "/auth/verify-email", "Confirm token"],
            ["POST", "/auth/resend-verify", "Resend with TTL from AppConfig"],
            ["POST", "/auth/forgot-password", "Time-limited reset (default 30 minutes)"],
            ["POST", "/auth/reset-password", "Set new password"],
            ["POST", "/auth/oauth/google|apple", "Phase 3 flagged stubs"],
            ["GET", "/auth/me", "Current user + activeRole"],
            ["POST", "/auth/switch-role", "Flip activeRole"],
            ["POST", "/auth/revoke-all", "Kill all refresh families"],
        ],
        [24, 52, 98],
    )
    pdf.h2("11.3 Core domain endpoints (summary)")
    pdf.p(
        "Users: profile, password, preferences, soft delete, device tokens. Home: GET /home/summary "
        "(role-specific). Designs: CRUD, duplicate, transition, lock, versions/restore, feasibility. "
        "Wizard: item-types, config by code, size charts. Master data: public catalogs + admin ETL import. "
        "Uploads: presign, confirm, multipart, content download. Render jobs and AI jobs as documented in §13 and §19."
    )
    pdf.h2("11.4 Password and lockout policy")
    pdf.p(
        "Defaults (overridable via AppConfig): min length 8, letter + number required, 5 login attempts, "
        "15-minute lock, email verify TTL 1440 minutes, password reset TTL 30 minutes. "
        "JWT access default 15m, refresh 7d."
    )

    # 12
    pdf.set_section("12. Data model")
    pdf.add_page()
    pdf.h1("12. Data model")
    pdf.p(
        "The Prisma schema is the contract. Two migrations: 20260802163914_init (users + refresh tokens) and "
        "20260804120000_domain_expansion (full domain, additive). Below is the logical map, not every column."
    )
    pdf.h2("12.1 Identity")
    pdf.p(
        "User, RefreshToken (familyId for reuse detection), PasswordResetToken, EmailVerificationToken, "
        "UserPreference (locale, preferred size, notification toggles), DeviceToken (iOS/Android push)."
    )
    pdf.h2("12.2 Master data")
    pdf.p(
        "ItemType + ItemTypeConfig (steps, JSON Schema, lock fields, compatibility rules, defaults). "
        "SizeChart, MeasurementGuide, EarringStyle, Metal + MetalPurity, Setting + SettingItemType, "
        "Stone + StoneOption (SHAPE, COLOR, CLARITY, SIZE_MM, WEIGHT_CT), FinishType, ElementCatalog, Region."
    )
    pdf.h2("12.3 Designs and jobs")
    pdf.p(
        "Design holds validated parameters JSON, lock metadata, feasibility, publish/expiry, accepted quote. "
        "DesignVersion snapshots parameters on autosave, lock, publish, restore. DesignAsset links uploads "
        "(element, inspiration, thumbnail, render, AI, export). GalleryItem curates public collection. "
        "RenderJob, AiGenerationJob, VisualizationJob share JobStatus: QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED."
    )
    pdf.h3("Design.parameters shape")
    pdf.code(
        "{\n"
        '  "size": { "standard", "sizeCode", "bandWidthMm?", "wristCircumferenceCm?",\n'
        '            "necklaceLengthCm?", "earringStyleCode?" },\n'
        '  "metal": { "metalCode", "purityCode" },\n'
        '  "setting": { "settingCode" },\n'
        '  "stoneHousing": "6-prong?",\n'
        '  "stones": [{ "stoneCode", "shape", "color", "clarity", "sizeMm", "weightCt", "placement" }],\n'
        '  "elements": [{ "elementCode" | "customUploadId", "placement" }],\n'
        '  "finishCode", "additionalStonesText", "personalNote"\n'
        "}"
    )
    pdf.h2("12.4 Marketplace")
    pdf.p(
        "JewelerProfile (publishStatus draft → preview → pending review → published/unpublished, verifiedBadge). "
        "JewelerOnboardingDraft, PortfolioItem, Review (isFeatured), DesignRequest (TARGETED | BROADCAST), "
        "DesignRequestTarget, JewelerCrmNote, Promotion (DESIGN | JEWELER | BANNER)."
    )
    pdf.h2("12.5 Chat and quotes")
    pdf.p(
        "Conversation per design with participants. Message types: TEXT, QUOTE_CARD, SYSTEM, IMAGE, AUDIO. "
        "Quote stores materialsCost, laborCost, laborHours, totalPrice, currency, etaBusinessDays, "
        "disclaimerPageId snapshot, status PENDING/ACCEPTED/DECLINED/EXPIRED/WITHDRAWN. QuoteEvent is the audit trail."
    )
    pdf.h2("12.6 Billing")
    pdf.p(
        "EntitlementDefinition, PlanCatalog, PlanEntitlement, Subscription, Lead, LeadOverageCharge, "
        "PaymentEvent, UsageEvent (meterKey design_model | hd_export | ai_generation | render)."
    )
    pdf.h2("12.7 Platform tables")
    pdf.p(
        "Upload, AppConfig, ContentPage, FeatureFlag, SystemMessageTemplate, NotificationTemplate, Notification, "
        "AuditLog, EventLog, IdempotencyKey, OutboxEvent."
    )

    # 13
    pdf.set_section("13. 3D Design Studio")
    pdf.add_page()
    pdf.h1("13. 3D Design Studio")
    pdf.p(
        "The studio is the product heart: one piece on screen, six tabs, live preview. Customizing size, metal, "
        "setting, and stone is local. Tripo is not the configurator. Playbook steps 1–10 are complete with "
        "dummy catalog meshes until production GLBs and live Tripo replace them."
    )
    pdf.h2("13.1 Tabs → parameters → viewer")
    pdf.grid(
        ["Tab", "Writes", "Viewer"],
        [
            ["Size", "size.standard, sizeCode, bandWidthMm / necklaceLengthCm / wristCircumferenceCm / earringStyleCode", "Scale root / band tube"],
            ["Metal", "metal.metalCode, metal.purityCode", "PBR on Metal material"],
            ["Setting", "setting.settingCode", "Toggle Setting_* children"],
            ["Stone", "stones[]", "Recolor Stone; extras as markers"],
            ["Elements", "elements[] (catalog or customUploadId)", "Markers on mesh"],
            ["Inspiration", "uploads, personalNote, jewelerNotes; POST /ai/inspiration", "Sample/output GLB from Uploads"],
        ],
        [28, 92, 54],
    )
    pdf.h2("13.2 UX rules")
    pdf.bullets(
        [
            "Chrome: Cancel / Done, 360° orbit, help. Thickness lives inside Size, not its own tab.",
            "After size + thickness: lock copy “we finished defining size and thickness”, then POST /designs/:id/lock.",
            "Locked fields: backend rejects PATCH; UI warns on reopen.",
            "Ring band default 3.0 mm (schema 0.5–15). Invalid band vs setting shows the API error string — do not bypass.",
            "Necklace cannot type a free length. Earring style is read-only in the Size tab.",
            "Closed studio offers try-on, export, and continue to design details.",
        ]
    )
    pdf.h2("13.3 Catalog meshes")
    pdf.p(
        "Dummy per-type GLBs in app/assets/models/studio/ (regenerate with "
        "python3 app/scripts/build-dummy-studio-glbs.py). Named nodes: Band, Stone, Setting_*. "
        "Keep names when replacing with production meshes."
    )
    pdf.h2("13.4 AI inspiration")
    pdf.p(
        "POST /ai/inspiration currently copies a dummy catalog GLB into Uploads and returns outputUploadId. "
        "Poll GET /ai/jobs/:id. When live Tripo is connected, download immediately (URLs expire in five minutes) "
        "into Uploads. If the job fails, the catalog mesh stays. Size/metal/setting/stone still must not call AI."
    )
    pdf.h2("13.5 Try-on and export")
    pdf.p(
        "Try-on: gallery/selfie → POST /visualization/jobs. Stub echoes the selfie. Paywall key "
        "personal_visualization; UI offers Pricing. Retention via viz_retention_hours. "
        "Export: STL or PNG_HD → POST /render-jobs. Stub writes a local upload. "
        "Dev designer seed includes a DESIGNER_PRO trial so try-on works locally."
    )

    # 14
    pdf.set_section("14. Atelier marketplace")
    pdf.add_page()
    pdf.h1("14. Atelier marketplace")
    pdf.p(
        "Atelier is two lists with shared search chrome: Designs (published jobs) and Jewelers (public profiles). "
        "Filter chips use closed regions: Tel Aviv, Jerusalem, Haifa, North, South, Center. "
        "GET /atelier/geo/search is the Phase 3 PostGIS path and is feature-flagged."
    )
    pdf.h2("14.1 Designs tab")
    pdf.p(
        "Cards: name, material summary, publish date and expiry, view details. Designers publish from My Designs. "
        "Jewelers open a design and submit a quote / request. POST /atelier/requests creates TARGETED or BROADCAST "
        "DesignRequest rows and delivers targets (lead consumption rules apply)."
    )
    pdf.h2("14.2 Jewelers tab")
    pdf.p(
        "Cards: business name, region, rating, review count, selected works, short bio, view profile, request quote. "
        "When a jeweler views themselves, Edit My Profile appears. Public profile: gallery, featured testimonials, "
        "add testimonial form (name, comment, 1–5 stars)."
    )
    pdf.h2("14.3 Profile publish")
    pdf.p(
        "Self-service draft → preview → publish. AppConfig.require_admin_approval_before_profile_publish can insert "
        "PENDING_REVIEW. Admin: POST /admin/jeweler-profiles/:id/approve and /verify-badge. "
        "Published profiles require E.164 phone for WhatsApp handoff."
    )
    pdf.h2("14.4 Sponsored content")
    pdf.p(
        "GET /atelier/banners and promotions feed. Promotions are PAID_PLACEMENT or SUBSCRIPTION_PERK. "
        "Disclosure tag Sponsored is mandatory. Phase 2 ranker (phase2_promotion_ranker) blends quality with "
        "sponsored priority and must always mark sponsored: true. Caps live in AppConfig.promotion_caps."
    )

    # 15
    pdf.set_section("15. Chat, quotes, and handoff")
    pdf.add_page()
    pdf.h1("15. Chat, quotes, and handoff")
    pdf.h2("15.1 Inbox")
    pdf.p(
        "Search plus filters: all / by design / by counterparty / by date. Row: name, last time, design title, "
        "unread badge, status snippet (ETA, pending approval, etc.)."
    )
    pdf.h2("15.2 Quote card")
    pdf.p(
        "Inline card: total, metal/karat snapshot, ETA days, View full offer. Full screen: materials vs labor, "
        "quote date, CMS-managed legal disclaimer (“the company is not responsible for financial arrangements, "
        "work quality, or disputes between the parties”), Confirm and accept. Designer may decline; jeweler may withdraw."
    )
    pdf.h2("15.3 Accept path")
    pdf.numbered(
        [
            "POST /quotes/:id/accept (idempotent).",
            "Quote → ACCEPTED; design can transition to COMPLETED with acceptedQuoteId.",
            "Outbox events quote.accepted and handoff.created.",
            "System message in chat with WhatsApp (or equivalent) deep link from the jeweler profile phone.",
            "No forced redirect out of the app — the link is in the thread.",
        ]
    )
    pdf.h2("15.4 Lead definition")
    pdf.p(
        "Frozen AppConfig.lead_definition.mode is design_request_delivery: a warm lead is consumed when a "
        "design request is delivered to a jeweler, not merely when a listing is viewed. Extra leads beyond "
        "plan quota create LeadOverageCharge at extraLeadPrice."
    )

    # 16
    pdf.set_section("16. Subscriptions and billing")
    pdf.add_page()
    pdf.h1("16. Subscriptions, entitlements, and billing")
    pdf.p(
        "Figma showed four priced plans per side. The running seed is a simpler catalog that still exercises "
        "entitlements, trials, and lead quotas. Treat Figma prices as product intent until finance confirms; "
        "treat seed codes as the engineering contract."
    )
    pdf.h2("16.1 Seeded plans (implemented)")
    pdf.grid(
        ["Code", "Price", "Trial", "Highlights"],
        [
            ["DESIGNER_FREE", "0 / month", "—", "Unlimited drafts, watermarked export"],
            ["DESIGNER_PRO", "49.9 / month", "14 days", "no_watermark, hd_export, personal_visualization, verified_designer_badge"],
            ["JEWELER_BASIC", "0 / month", "—", "3 requests / month, standard listing"],
            ["JEWELER_ACTIVE", "199 / month", "14 days", "15 leads, extra 25, warm_leads, priority_routing, jeweler_crm, priority_cloud_processing"],
        ],
        [40, 28, 22, 84],
    )
    pdf.h2("16.2 Figma commercial intent (not all coded 1:1)")
    pdf.grid(
        ["Designer (Figma)", "Jeweler (Figma)"],
        [
            ["Pay per item ₪15 / model", "Pay per lead ₪25–35"],
            ["Monthly ₪120, no commitment", "Active ₪180 / month, 15 leads"],
            ["Annual ₪990 (~30% off) + 20 warm leads", "Annual manufacturer ₪1,600"],
            ["PRO ₪2,600 / year", "Premium PRO ₪500 / month, 100 leads, CRM, sponsored slot"],
        ],
        [87, 87],
    )
    pdf.h2("16.3 Frozen entitlement keys")
    pdf.p(
        "no_watermark, hd_export, personal_visualization, warm_leads, verified_designer_badge, "
        "priority_cloud_processing, priority_routing, jeweler_crm. Do not rename without expand-contract."
    )
    pdf.h2("16.4 API")
    pdf.p(
        "GET /subscriptions/plans, GET /subscriptions/me, GET /subscriptions/entitlements/me, "
        "POST /subscriptions/subscribe, POST /subscriptions/cancel, POST /webhooks/payments. "
        "Missing entitlement → 403 PAYWALL so the client can open Pricing."
    )

    # 17
    pdf.set_section("17. Master data, CMS, admin")
    pdf.add_page()
    pdf.h1("17. Master data, CMS, and admin")
    pdf.h2("17.1 Catalogs")
    pdf.p(
        "Public GET /master-data/* for item types, metals, settings, stones, finish types, elements, regions, "
        "size charts, measurement guides. Admin CRUD plus POST /admin/master-data/etl/import for Excel-driven loads "
        "with missing/duplicate validation — the PRD’s required path away from Figma “Text” placeholders."
    )
    pdf.h3("Seeded examples")
    pdf.bullets(
        [
            "Metals: silver 925; yellow / rose / white gold 14K & 18K; platinum 950. Figma metal tab emphasizes silver / yellow / rose; white gold and platinum exist in catalog.",
            "Settings: 4_PRONG, 6_PRONG, BEZEL, PAVE (Figma labels half-bezel / Tiffany may be added later).",
            "Stones: diamond, sapphire, ruby, emerald with shape/color/clarity/size options.",
            "Elements: heart, star, leaf, initial + custom image upload.",
        ]
    )
    pdf.h2("17.2 CMS and config")
    pdf.p(
        "Content pages: faq, tos, privacy, quote_disclaimer. Home designer/jeweler blocks are JSON in AppConfig. "
        "Public GET /config/public for non-secret keys. Admin can publish content without an app release."
    )
    pdf.h2("17.3 Admin")
    pdf.p(
        "Health summary, feature flags, promotions, gallery curation, design feasibility, jeweler approve/verify. "
        "RBAC: ADMIN role. Intended for an internal console; the mobile app is not the admin UI."
    )

    # 18
    pdf.set_section("18. Security and privacy")
    pdf.add_page()
    pdf.h1("18. Security, privacy, and compliance")
    pdf.bullets(
        [
            "TLS in transit (deployment responsibility); passwords bcrypt; JWT secret ≥ 32 characters in production.",
            "Refresh rotation with family reuse detection; revoke-all on password change / logout-all.",
            "Login lockout and global throttling.",
            "RBAC on every controller; jeweler cannot mutate another designer’s draft; designer cannot publish another’s profile.",
            "Uploads: mime allow-list and maxBytes from AppConfig.upload_limits; statuses include QUARANTINED.",
            "Visualization inputs are body photos — retain only until viz_retention_hours, then delete; disclose in privacy policy.",
            "Legal disclaimer on quotes is CMS-managed and must stay aligned with Terms of Use.",
            "AuditLog for admin and sensitive mutations; do not log secrets or raw tokens.",
            "PRD bar: Israeli privacy law; GDPR if EU users are in scope. Encryption at rest is an infra control.",
        ]
    )
    pdf.callout(
        "Secrets",
        "backend/.env is local-only. Never commit JWT_SECRET, DATABASE_URL with production credentials, "
        "or payment provider keys. .env.example documents names only.",
        AMBER,
    )

    # 19
    pdf.set_section("19. Integrations and jobs")
    pdf.add_page()
    pdf.h1("19. Integrations and jobs")
    pdf.grid(
        ["Integration", "Phase 1 reality", "Target"],
        [
            ["Render / CAD export", "Stub adapter writes a local upload (STL / PNG_HD)", "External engine (Yonatan / vendor) REST or SDK; SLA and cost TBD"],
            ["AI 3D (Tripo)", "Sample GLB copy into Uploads", "Live Tripo; download before 5-minute expiry"],
            ["Visualization", "Echo selfie; paywall enforced", "Landmark overlay; later ARKit/ARCore"],
            ["Object storage", "Local fake presign if S3_ENDPOINT unset", "S3-compatible bucket"],
            ["Mail", "MAIL_FROM configured; verify/reset links via APP_URL", "Production SMTP/provider"],
            ["Push", "Device tokens stored; outbox notification.push", "APNs / FCM worker"],
            ["Payments (SaaS)", "Webhook endpoint + PaymentEvent", "Stripe / Israeli processor (Tranzila/CardCom)"],
            ["Jewelry pay", "POST /jewelry-payments/intents stub, flag off", "Phase 3 optional escrow"],
            ["OAuth", "Google/Apple routes stubbed, flag off", "Phase 3"],
            ["Geo", "/atelier/geo/search stub, flag off", "PostGIS radius search"],
        ],
        [40, 68, 66],
    )
    pdf.h2("19.1 Outbox event keys")
    pdf.p(
        "quote.accepted, handoff.created, design.published, design_request.delivered, notification.push, "
        "render.completed, ai.completed, visualization.completed."
    )
    pdf.h2("19.2 Feature flags")
    pdf.grid(
        ["Flag", "Default"],
        [
            ["phase2_visualization", "off until Phase 2"],
            ["phase2_promotion_ranker", "off"],
            ["phase2_matching", "off"],
            ["phase3_oauth", "off"],
            ["phase3_postgis", "off"],
            ["phase3_jewelry_pay", "off"],
        ],
        [70, 104],
    )

    # 20
    pdf.set_section("20. Local development")
    pdf.add_page()
    pdf.h1("20. Local development and operations")
    pdf.h2("20.1 Prerequisites")
    pdf.bullets(
        [
            "Node.js ≥ 22.11 for the app, ≥ 20 for the API.",
            "Docker Desktop for Postgres 16 + Redis 7.",
            "Xcode and/or Android Studio; CocoaPods for iOS.",
            "Copy backend/.env.example → backend/.env.",
        ]
    )
    pdf.h2("20.2 Commands")
    pdf.code(
        "docker compose up -d postgres redis\n"
        "cd backend && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run start:dev\n"
        "cd app && npm install && npx react-native-asset && npm start\n"
        "npm run ios   # or npm run android"
    )
    pdf.h2("20.3 Seed users")
    pdf.grid(
        ["Email", "Password", "Notes"],
        [
            ["designer@dev.mailnvosky.local", "Designer123!", "DESIGNER_PRO trial for visualization"],
            ["jeweler@dev.mailnvosky.local", "Jeweler123!", "Published sample profile (Tel Aviv)"],
        ],
        [70, 40, 64],
    )
    pdf.h2("20.4 Quality gates")
    pdf.p(
        "backend: nest build, optional npm run test:e2e:local. app: tsc --noEmit, jest, eslint. "
        "Phase 1 exit: Swagger tags present, flags off, quote-accept path walkable with Postgres/Redis up."
    )
    pdf.h2("20.5 Additive contract rule")
    pdf.p(
        "After Phase 1 Beta, do not rename or drop api/v1 fields or entitlement keys without expand-contract "
        "and an ADR. New item types should be data (ItemTypeConfig), not a hard-coded release."
    )

    # 21
    pdf.set_section("21. Implementation status")
    pdf.add_page()
    pdf.h1("21. Implementation status")
    pdf.grid(
        ["Phase", "Status", "Notes"],
        [
            ["0 Foundation", "Done", "Full Prisma schema, Redis, CMS, flags, uploads, audit, outbox, entitlements, admin, jobs shell"],
            ["1 MVP", "Done", "Auth+, home, designs, wizard, master-data, render/AI stubs, atelier, chat/quotes, subscriptions"],
            ["2 Advanced", "Done, flagged off", "Visualization, promotions ranker, matching/CRM"],
            ["3 Scale", "Stubbed, flagged off", "OAuth, geo search, jewelry payment intents"],
        ],
        [36, 40, 98],
    )
    pdf.h2("21.1 Phase 1 exit gate (checked)")
    pdf.bullets(
        [
            "Domain schema + additive migration.",
            "Auth: register pending verify, verify, resend, forgot/reset, switch-role, revoke-all.",
            "Users: profile, password, preferences, soft delete, device tokens.",
            "Home summary for both roles.",
            "Designs CRUD, versions, lock, transition, feasibility, duplicate.",
            "Wizard + public/admin master data + ETL import.",
            "Render jobs + AI inspiration stubs.",
            "Atelier search, requests, banners; jeweler draft→publish; reviews.",
            "Chat REST + Socket.io /ws; quote accept handoff; notifications.",
            "Subscriptions, leads, usage events, payment webhooks.",
            "Swagger; Phase 2/3 flags seeded off; npm run build passes.",
        ]
    )
    pdf.h2("21.2 Studio playbook")
    pdf.p(
        "Steps 1–10 complete: shell, size, metal, setting, stones, elements, lock modal, catalog GLB materials, "
        "inspiration generate (sample), try-on + export. Dummy meshes remain until production assets and live Tripo."
    )
    pdf.h2("21.3 Known gaps versus Figma/PRD polish")
    pdf.bullets(
        [
            "True drag-onto-mesh for stones/elements waits on GLBs with named seats.",
            "Metal tab vs full catalog (12K in Figma vs seed 14K/18K/925/950) needs a product call.",
            "Setting labels in Figma (Tiffany / half-bezel) differ from seed codes.",
            "FAQ in original Figma export was fitness-app placeholder — replace with jewelry FAQ content.",
            "Terms of Use need counsel-drafted text; structure exists as ContentPage.",
            "Push provider and production mail/S3/payment not wired.",
            "Figma four-tier pricing not identical to seeded two-tier-per-role catalog.",
        ]
    )

    # 22
    pdf.set_section("22. Roadmap")
    pdf.add_page()
    pdf.h1("22. Roadmap and remaining work")
    pdf.p(
        "PRD assumed two-week sprints and a closed Beta around week 18 from discovery. Engineering has completed "
        "the Phase 1 backend/app skeleton including studio. Remaining work is production hardening, vendor 3D, "
        "and turning on Phase 2 flags after QA."
    )
    pdf.h2("22.1 Near term")
    pdf.numbered(
        [
            "Replace dummy GLBs with manufacturable-quality per-type studio meshes; keep node names.",
            "Connect Tripo (or chosen vendor) on inspiration generate only; persist files in Uploads.",
            "Scope the render engine: STL/OBJ/STEP, latency, cost per job, watermark rules.",
            "Production object storage, mail, APNs/FCM, and subscription payment provider.",
            "Legal FAQ/TOS/privacy + visualization retention copy.",
            "Confirm plan catalog vs Figma prices; keep entitlement keys stable.",
            "E2E on devices: register → studio → publish → request → quote → accept → handoff.",
        ]
    )
    pdf.h2("22.2 Phase 2 (after MVP feedback)")
    pdf.bullets(
        [
            "Personal visualization beyond stub overlay; paywall before GPU work.",
            "Sponsored ranker with always-visible Sponsored tag and caps.",
            "Matching by region + specialty; jeweler CRM used in production.",
        ]
    )
    pdf.h2("22.3 Phase 3")
    pdf.bullets(
        [
            "Google/Apple OAuth for faster activation.",
            "PostGIS radius search if region chips are not enough.",
            "Optional in-app jewelry payment / brokerage if Quote-to-Deal measurement demands it.",
            "Web console for jewelers (open PRD question — not in MVP).",
        ]
    )
    pdf.h2("22.4 Non-functional targets (PRD)")
    pdf.grid(
        ["Area", "Target"],
        [
            ["Availability", "99.5% on core services (excluding 3D vendor)"],
            ["Read latency", "< 300 ms excluding render/AI"],
            ["Platform", "iOS + Android MVP"],
            ["Loading UX", "Explicit placeholders for every vendor-backed job"],
        ],
        [40, 134],
    )

    # 23
    pdf.set_section("23. Risks and open decisions")
    pdf.add_page()
    pdf.h1("23. Risks and open decisions")
    pdf.grid(
        ["Risk", "Impact", "Mitigation"],
        [
            ["External 3D vendor not fully contracted", "Export/AI quality and cost unknown", "Adapter boundary already in place; dummy path keeps studio usable"],
            ["Jewelry payment off-app", "Weak Quote-to-Deal KPI", "Track accept+handoff; Phase 3 pay stub exists"],
            ["Master data / Figma mismatch", "Wrong metals/settings in UI", "Admin ETL + product call before GA"],
            ["Body-photo visualization", "Privacy exposure", "Short TTL, encrypted storage, policy text"],
            ["Placeholder legal/FAQ", "Launch compliance risk", "Counsel + CMS publish before Beta"],
            ["Warm-lead billing disputes", "Trust / revenue leakage", "Frozen definition: design_request_delivery"],
        ],
        [48, 52, 74],
    )
    pdf.h2("23.1 Decisions still owned by product")
    pdf.bullets(
        [
            "Whether admin approval is mandatory before jeweler profiles go live.",
            "Whether Figma 12K / Tiffany / half-bezel become catalog codes or stay visual shorthand.",
            "Final plan prices, trial presence, and whether pay-per-item is first-class in seed.",
            "Official marketplace name (Atelier is implemented).",
            "Whether a jeweler web app is in scope after mobile GA.",
        ]
    )

    # 24
    pdf.set_section("24. Glossary")
    pdf.add_page()
    pdf.h1("24. Glossary")
    pdf.grid(
        ["Term", "Meaning"],
        [
            ["Tsila", "Customer-facing product name"],
            ["Malinvosky", "Codebase / company working title"],
            ["Atelier", "Marketplace module (designs + jewelers)"],
            ["Studio", "Six-tab 3D configurator"],
            ["Lock", "Confirmed freeze of size/thickness (and other lockFields)"],
            ["Feasibility", "In-house review before marketplace publish when configured"],
            ["Quote card", "Structured offer embedded in chat"],
            ["Handoff", "Post-accept system message with direct-contact link"],
            ["Warm lead", "Delivered design request to a jeweler (billing event)"],
            ["Entitlement", "Feature key granted by an active/trialing plan"],
            ["PAYWALL", "API error code when an entitlement is missing"],
            ["Outbox", "Transactional events processed asynchronously"],
            ["Catalog GLB", "Hosted mesh used by the local viewer"],
            ["Tripo", "Intended AI 3D provider for inspiration generate only"],
            ["RBAC", "Role-based access control (designer / jeweler / admin)"],
        ],
        [40, 134],
    )

    # Appendix A
    pdf.set_section("Appendix A — API catalog")
    pdf.add_page()
    pdf.h1("Appendix A — API catalog")
    pdf.p("All paths are under /api/v1 unless noted. Admin controllers require ADMIN.")
    pdf.grid(
        ["Area", "Endpoints"],
        [
            ["Health", "GET /health"],
            ["Auth", "register, login, refresh, logout, verify-email, resend-verify, forgot/reset-password, oauth google/apple, me, switch-role, revoke-all"],
            ["Users", "GET/PATCH /users/me, password, preferences, DELETE me, devices, GET /users/:id"],
            ["Home", "GET /home/summary"],
            ["Designs", "POST/GET/PATCH /designs, duplicate, transition, lock, versions, restore, feasibility"],
            ["Wizard", "GET /wizard/item-types, /config/:code, /size-charts/:code"],
            ["Master data", "GET catalogs; admin CRUD + etl/import"],
            ["Uploads", "presign, confirm, POST file, GET /uploads/:id/content"],
            ["Render", "POST /render-jobs, GET :id, POST :id/cancel"],
            ["AI", "POST /ai/inspiration, GET /ai/jobs/:id"],
            ["Visualization", "POST/GET /visualization/jobs"],
            ["Atelier", "designs, jewelers, banners, geo/search, requests"],
            ["Jeweler profiles", "me, draft, preview, publish, orders, portfolio, crm-notes, GET :id"],
            ["Reviews", "POST/GET, PATCH :id/feature"],
            ["Chat", "GET/POST /conversations, messages, read; WS /ws"],
            ["Quotes", "POST, GET :id, accept, decline, PATCH"],
            ["Notifications", "GET, read, read-all"],
            ["Subscriptions", "plans, me, entitlements/me, subscribe, cancel"],
            ["Webhooks", "POST /webhooks/payments"],
            ["Gallery", "GET public; admin CRUD"],
            ["CMS", "GET content/:slug, public config; admin config/content/publish"],
            ["Flags", "GET /feature-flags; admin CRUD"],
            ["Promotions", "GET /promotions/feed; admin CRUD"],
            ["Jewelry pay", "POST /jewelry-payments/intents (flagged)"],
            ["Admin extra", "health-summary, designs feasibility, jeweler approve/verify-badge"],
        ],
        [40, 134],
    )

    # Appendix B
    pdf.set_section("Appendix B — Screen map")
    pdf.add_page()
    pdf.h1("Appendix B — Screen map")
    pdf.p(
        "The PRD audited 82 Figma frames. The app implements the same clusters rather than a 1:1 frame count "
        "(empty/filled variants are one component)."
    )
    pdf.grid(
        ["Figma cluster", "App implementation"],
        [
            ["Sign-up / login / recovery", "AuthStack"],
            ["Designer home", "DesignerHomeScreen"],
            ["My Designs statuses", "MyDesignsScreen + DesignDetailsScreen"],
            ["Wizard Size/Metal/Setting/Stone/Elements/Inspiration", "Home stack + DesignStudioScreen tabs"],
            ["Personal visualization", "Studio close actions + visualization API"],
            ["Marketplace designs + details", "AtelierScreen + PublicDesignScreen"],
            ["Chat + measurement guides", "ChatsScreen, ChatThreadScreen, MeasurementGuideScreen"],
            ["Jeweler marketplace + profile", "Atelier jewelers tab, JewelerProfileScreen, reviews"],
            ["Account, TOS, FAQ, pricing", "Profile stack"],
            ["Jeweler home / orders / quote form", "MyOrdersScreen, OrderDetailsScreen, SubmitQuoteScreen"],
            ["Create/edit business profile", "BusinessProfileForm / Preview / View"],
        ],
        [78, 96],
    )

    # Appendix C
    pdf.set_section("Appendix C — Seed and config")
    pdf.add_page()
    pdf.h1("Appendix C — Seed and configuration")
    pdf.h2("C.1 AppConfig keys")
    pdf.grid(
        ["Key", "Purpose"],
        [
            ["password_policy", "{ minLength, requireLetter, requireNumber }"],
            ["upload_limits", "{ maxBytes, allowedMimeTypes[] }"],
            ["token_ttls", "{ emailVerifyMinutes, passwordResetMinutes }"],
            ["lockout", "{ maxAttempts, lockMinutes }"],
            ["lead_definition", '{ mode: "design_request_delivery" }'],
            ["require_feasibility_before_publish", "boolean"],
            ["require_admin_approval_before_profile_publish", "boolean"],
            ["marketplace_publish_ttl_days", "number"],
            ["home_designer / home_jeweler", "CMS block JSON"],
            ["ranking_weights / promotion_caps", "Phase 2"],
            ["viz_retention_hours", "Phase 2 visualization TTL"],
        ],
        [78, 96],
    )
    pdf.h2("C.2 Local environment (names only)")
    pdf.p(
        "NODE_ENV, PORT, API_PREFIX, APP_TIMEZONE, APP_URL, CORS_ORIGINS, BODY_SIZE_LIMIT, DATABASE_URL, "
        "REDIS_URL, S3_BUCKET, S3_ENDPOINT, MAIL_FROM, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, "
        "REGISTRATION_OPEN, LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES, EMAIL_VERIFY_TTL_MINUTES, "
        "PASSWORD_RESET_TTL_MINUTES, password policy flags, THROTTLE_TTL_MS, THROTTLE_LIMIT, LOG_LEVEL."
    )
    pdf.h2("C.3 Default database URL")
    pdf.code("postgresql://mailnvosky:mailnvosky@localhost:5433/mailnvosky?schema=public")
    pdf.h2("C.4 Document history")
    pdf.grid(
        ["Version", "Date", "Notes"],
        [
            ["PRD 1.0", "8 July 2026", "Requirements + Figma audit"],
            ["This document 1.0", "14 September 2026", "As-built platform + remaining work"],
        ],
        [40, 40, 94],
    )
    pdf.ln(6)
    pdf.italic(
        "End of document. For live request/response shapes, use Swagger at http://localhost:3000/api/v1/docs "
        "when the API is running. For studio changes, follow docs/3d-studio-guide.md one step at a time."
    )


def rewrite_for_viewers(path: Path) -> None:
    """Flatten to a simple page-only PDF so Cursor/PDF.js can open it."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(path))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata(
        {
            "/Title": "Malinvosky / Tsila - Full Project Document",
            "/Author": "Malinvosky Engineering",
            "/Subject": "3D jewelry design and designer-jeweler marketplace",
            "/Creator": "Malinvosky project documentation generator",
        }
    )
    tmp = path.with_suffix(".compat.pdf")
    with tmp.open("wb") as handle:
        writer.write(handle)
    tmp.replace(path)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = ProjectPDF()
    draw_cover(pdf)
    build(pdf)
    pdf.output(str(OUT))
    rewrite_for_viewers(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {pdf.page_no()} pages)")


if __name__ == "__main__":
    main()
