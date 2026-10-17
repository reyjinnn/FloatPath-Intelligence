"""Presentation mapping for synthetic company fixtures."""

PRESENTATION_MAP = {
    "DEMO-001": {
        "legal_name": "PT Arunika Infrastruktur Tbk (Fiktif)",
        "presentation_code": "ARIF-SYN",
    },
    "DEMO-002": {
        "legal_name": "PT Batara Logistik Nusantara Tbk (Fiktif)",
        "presentation_code": "BALO-SYN",
    },
    "DEMO-003": {
        "legal_name": "PT Cipta Media Graha Tbk (Fiktif)",
        "presentation_code": "CIMG-SYN",
    },
    "DEMO-004": {
        "legal_name": "PT Daniswara Niaga Makmur Tbk (Fiktif)",
        "presentation_code": "DNAM-SYN",
    },
    "DEMO-005": {
        "legal_name": "PT Elang Energi Pratama Tbk (Fiktif)",
        "presentation_code": "EERA-SYN",
    },
}


def enrich_company_presentation(company: dict) -> dict:
    code = company.get("code")
    mapping = PRESENTATION_MAP.get(code, {})
    presentation_code = mapping.get("presentation_code", f"{code}-SYN" if code else "SYN")
    legal_name = company["legal_name"]
    return {
        **company,
        "presentation_code": presentation_code,
        "legal_name": legal_name,
        "demo": True,
        "data_mode": "SYNTHETIC",
    }
