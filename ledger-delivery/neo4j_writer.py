"""
Neo4j Aura writer — persists creative features per the Ledger graph schema.

Graph shape:
    (:Creative {id, hook_copy, description, confidence, tags, updated_at})
      -[:HAS_FEATURE]->
    (:CreativeFeature {type, value})

The 8 structured features (angle, subject, person, background, hook_type,
offer, color_dominant, format) each become a CreativeFeature node MERGEd
by (type, value) so identical feature values across creatives share nodes.
Null / "null" feature values are skipped — no empty CreativeFeature nodes.

Env vars (required, loaded from repo-root .env):
    NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
    NEO4J_DATABASE (optional, defaults to "neo4j")

Usage:
    from ledger_delivery.neo4j_writer import write_creative, verify_connection

    verify_connection()           # raises if creds/URI are wrong
    write_creative(
        creative_id="cr_042",
        structured={"angle": "testimonial", "subject": "ugc", ...},
        hook_copy="I lost 15 lbs in 3 weeks",
        description="A woman in her 30s...",
        confidence=0.87,
        discovered_tags=["UGC-style", "sunlit", "kitchen"],
    )
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} missing in {_ENV_PATH}")
    return value


NEO4J_URI = _require("NEO4J_URI")
NEO4J_USERNAME = _require("NEO4J_USERNAME")
NEO4J_PASSWORD = _require("NEO4J_PASSWORD")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j").strip() or "neo4j"

_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))


_WRITE_QUERY = """
MERGE (c:Creative {id: $creative_id})
SET c.hook_copy = $hook_copy,
    c.description = $description,
    c.confidence = $confidence,
    c.tags = $tags,
    c.updated_at = datetime()
WITH c
UNWIND $features AS feat
MERGE (f:CreativeFeature {type: feat.type, value: feat.value})
MERGE (c)-[:HAS_FEATURE]->(f)
"""


def write_creative(
    creative_id: str,
    structured: dict,
    hook_copy: str | None = None,
    description: str | None = None,
    confidence: float | None = None,
    discovered_tags: list[str] | None = None,
) -> None:
    """Write (or update) a Creative node and its HAS_FEATURE edges."""
    features = [
        {"type": k, "value": str(v)}
        for k, v in (structured or {}).items()
        if v is not None and v != "null"
    ]
    with _driver.session(database=NEO4J_DATABASE) as session:
        session.execute_write(
            lambda tx: tx.run(
                _WRITE_QUERY,
                creative_id=creative_id,
                hook_copy=hook_copy,
                description=description,
                confidence=confidence,
                tags=discovered_tags or [],
                features=features,
            )
        )


def verify_connection() -> bool:
    """Quick reachability check — raises neo4j exceptions on failure."""
    with _driver.session(database=NEO4J_DATABASE) as session:
        record = session.run("RETURN 1 AS ok").single()
        return record is not None and record["ok"] == 1


def close() -> None:
    """Call at process shutdown if running as a long-lived service."""
    _driver.close()
