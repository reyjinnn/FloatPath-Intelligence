"""Strict request boundaries. All numbers used for shares stay integers."""
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, field_validator, model_validator

MAX_SHARES = 9_007_199_254_740_991
Shares = Annotated[StrictInt, Field(ge=0, le=MAX_SHARES)]
PositiveShares = Annotated[StrictInt, Field(gt=0, le=MAX_SHARES)]
Ref = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$", max_length=64)]
EvidenceRef = Annotated[str, StringConstraints(pattern=r"^fixture://[a-z0-9_/-]{1,180}$", max_length=200)]
Flag = Literal["TRUE", "FALSE", "UNKNOWN"]
Eligibility = Literal["ELIGIBLE", "INELIGIBLE", "UNKNOWN"]
HolderType = Literal["PERSON", "ORGANIZATION", "AGGREGATE"]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Flags(Body):
    controller: Flag = "FALSE"
    controller_affiliate: Flag = "FALSE"
    director_commissioner: Flag = "FALSE"
    treasury: Flag = "FALSE"
    restricted: Flag = "FALSE"


class Holding(Flags):
    holder_ref: Ref
    shares: Shares
    eligibility: Eligibility = "UNKNOWN"
    holder_type: HolderType = "ORGANIZATION"
    evidence_ref: EvidenceRef | None = None
    source_as_of_date: date | None = Field(default=None, exclude_if=lambda value: value is None)

    @model_validator(mode="after")
    def check_eligibility_conflict(self):
        if self.eligibility == "ELIGIBLE" and any(
            getattr(self, flag) == "TRUE" for flag in Flags.model_fields
        ):
            raise ValueError("ELIGIBILITY_CONFLICT: eligible assertion contradicts exclusion flags")
        return self


class Allocation(Body):
    holder_ref: Ref
    shares: Shares
    eligibility: Eligibility | None = None
    holder_type: HolderType | None = None
    evidence_ref: EvidenceRef | None = None
    controller: Flag | None = None
    controller_affiliate: Flag | None = None
    director_commissioner: Flag | None = None
    treasury: Flag | None = None
    restricted: Flag | None = None


class Action(Body):
    action_type: Literal["TRANSFER", "NEW_ISSUANCE"]
    seller_ref: Ref | None = None
    allocations: Annotated[list[Allocation], Field(min_length=1, max_length=100,
                                                    description="1–100 allocations; zero shares allowed only for NEW_ISSUANCE")]
    price_idr_per_share: Annotated[str, StringConstraints(pattern=r"^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$", max_length=19)] | None = None


class SnapshotBody(Body):
    id: UUID | None = None
    as_of_date: date
    source_as_of_date: date | None = Field(default=None, exclude_if=lambda value: value is None)
    total_shares: PositiveShares
    board: Literal["DEMO_STANDARD"] = "DEMO_STANDARD"
    sid_count: Shares | None = None
    holders: Annotated[list[Holding], Field(max_length=10_000)] = Field(default_factory=list)

    @field_validator("holders")
    @classmethod
    def unique_holders(cls, holders):
        refs = [h.holder_ref for h in holders]
        if len(refs) != len(set(refs)):
            raise ValueError("Duplicate holder_ref")
        return holders


class CompanyBody(Body):
    legal_name: Annotated[str, StringConstraints(pattern=r"^DEMO[ A-Z0-9_-]{0,60}$", max_length=64)]
    board: Literal["DEMO_STANDARD"] = "DEMO_STANDARD"
    demo: Literal[True] = True
    code: Literal["DEMO-001", "DEMO-002", "DEMO-003", "DEMO-004", "DEMO-005"] = "DEMO-001"


class CSVBody(Body):
    csv_content: Annotated[str, Field(max_length=5 * 1024 * 1024)]


class DemoSimulation(Body):
    company_id: Annotated[str, Field(max_length=64)]
    action: Action


class DemoReport(Body):
    company_id: Annotated[str, Field(max_length=64)]
    actions: Annotated[list[Action], Field(min_length=1, max_length=2)]


class ScenarioIds(Body):
    scenario_ids: Annotated[list[UUID], Field(min_length=1, max_length=3)]

    @field_validator("scenario_ids")
    @classmethod
    def unique_ids(cls, ids):
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate scenario IDs")
        return ids


class LoginBody(Body):
    username: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$", min_length=1, max_length=64)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class HoldingsReviewBody(Body):
    holders: Annotated[list[Holding], Field(min_length=1, max_length=10_000)]

    @field_validator("holders")
    @classmethod
    def unique_holders(cls, holders):
        refs = [h.holder_ref for h in holders]
        if len(refs) != len(set(refs)):
            raise ValueError("Duplicate holder_ref")
        return holders


class CreateUserBody(Body):
    username: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$", min_length=1, max_length=64)]
    password: Annotated[str, StringConstraints(min_length=12, max_length=256)]
    role: Literal["viewer", "analyst", "reviewer", "admin"]


class UpdateUserRoleBody(Body):
    role: Literal["viewer", "analyst", "reviewer", "admin"]


