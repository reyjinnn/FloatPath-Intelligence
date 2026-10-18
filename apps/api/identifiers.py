"""UUID identities for new records; references, namespaces, and hashes are not IDs."""
from uuid import NAMESPACE_URL, uuid5


def stable_id(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, "floatpath:" + value))


# The workspace_id column remains the fixed synthetic namespace, not an entity ID.
SYNTHETIC_WORKSPACE_ENTITY_ID = stable_id("workspace:synthetic")
