from __future__ import annotations

from dataclasses import dataclass

SCORING_CATEGORIES = {
    "territory": "Territory Control",
    "surface": "Exposed Surface",
    "enclosure": "Enclosure",
    "chain": "Chain Length",
    "support": "Support Quality",
    "choke": "Choke Pressure",
    "symmetry": "Symmetry",
}

STRATEGY_SHIFT_LABELS = {
    "expand": "Expand",
    "reinforce": "Reinforce",
    "wrap": "Wrap",
    "pillar": "Pillar",
}

SYMMETRY_MODE_LABELS = {
    "none": "No Symmetry",
    "mirror_x": "Mirror Across X",
    "mirror_y": "Mirror Across Y",
    "radial": "Radial Balance",
}


@dataclass(frozen=True)
class BuildabilityProfile:
    max_cantilever: int
    max_unsupported_height: int
    require_support_path: bool
    allow_pillar_drop: bool
    require_host_contact: bool

    def to_dict(self) -> dict[str, int | bool]:
        return {
            "maxCantilever": self.max_cantilever,
            "maxUnsupportedHeight": self.max_unsupported_height,
            "requireSupportPath": self.require_support_path,
            "allowPillarDrop": self.allow_pillar_drop,
            "requireHostContact": self.require_host_contact,
        }


@dataclass(frozen=True)
class ArchetypeProfile:
    id: str
    label: str
    default_objective_weights: dict[str, float]
    allowed_strategy_shifts: tuple[str, ...]
    initial_strategy: str
    buildability_profile: BuildabilityProfile
    symmetry_mode: str = "none"

    def to_catalog_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "label": self.label,
            "defaultObjectiveWeights": self.default_objective_weights,
            "allowedStrategyShifts": list(self.allowed_strategy_shifts),
            "initialStrategy": self.initial_strategy,
            "buildabilityProfile": self.buildability_profile.to_dict(),
            "symmetryMode": self.symmetry_mode,
        }


ARCHETYPE_PROFILES: dict[str, ArchetypeProfile] = {
    "fortress": ArchetypeProfile(
        id="fortress",
        label="Fortress",
        default_objective_weights={
            "territory": 0.6,
            "surface": 0.5,
            "enclosure": 2.2,
            "chain": 0.3,
            "support": 2.0,
            "choke": 0.8,
            "symmetry": 0.9,
        },
        allowed_strategy_shifts=("expand", "reinforce", "pillar"),
        initial_strategy="reinforce",
        buildability_profile=BuildabilityProfile(
            max_cantilever=1,
            max_unsupported_height=2,
            require_support_path=True,
            allow_pillar_drop=True,
            require_host_contact=False,
        ),
        symmetry_mode="mirror_x",
    ),
    "vine": ArchetypeProfile(
        id="vine",
        label="Vine",
        default_objective_weights={
            "territory": 1.0,
            "surface": 1.1,
            "enclosure": 0.2,
            "chain": 2.4,
            "support": 0.7,
            "choke": 1.7,
            "symmetry": 0.1,
        },
        allowed_strategy_shifts=("expand", "wrap"),
        initial_strategy="expand",
        buildability_profile=BuildabilityProfile(
            max_cantilever=2,
            max_unsupported_height=1,
            require_support_path=True,
            allow_pillar_drop=False,
            require_host_contact=True,
        ),
    ),
    "coral": ArchetypeProfile(
        id="coral",
        label="Coral",
        default_objective_weights={
            "territory": 0.9,
            "surface": 2.3,
            "enclosure": 0.4,
            "chain": 1.7,
            "support": 1.0,
            "choke": 0.5,
            "symmetry": 0.4,
        },
        allowed_strategy_shifts=("expand", "reinforce"),
        initial_strategy="expand",
        buildability_profile=BuildabilityProfile(
            max_cantilever=2,
            max_unsupported_height=2,
            require_support_path=True,
            allow_pillar_drop=False,
            require_host_contact=False,
        ),
        symmetry_mode="radial",
    ),
    "territorial": ArchetypeProfile(
        id="territorial",
        label="Territorial",
        default_objective_weights={
            "territory": 2.5,
            "surface": 1.1,
            "enclosure": 0.7,
            "chain": 0.7,
            "support": 1.1,
            "choke": 1.0,
            "symmetry": 0.2,
        },
        allowed_strategy_shifts=("expand", "wrap", "pillar"),
        initial_strategy="expand",
        buildability_profile=BuildabilityProfile(
            max_cantilever=2,
            max_unsupported_height=2,
            require_support_path=True,
            allow_pillar_drop=True,
            require_host_contact=False,
        ),
    ),
}


def list_archetypes() -> list[dict[str, object]]:
    return [
        profile.to_catalog_dict()
        for profile in sorted(ARCHETYPE_PROFILES.values(), key=lambda item: item.label)
    ]


def list_strategy_shifts() -> list[dict[str, str]]:
    return [
        {"id": strategy_id, "label": label}
        for strategy_id, label in sorted(STRATEGY_SHIFT_LABELS.items())
    ]


def list_symmetry_modes() -> list[dict[str, str]]:
    return [
        {"id": mode_id, "label": label}
        for mode_id, label in sorted(SYMMETRY_MODE_LABELS.items())
    ]


def list_scoring_categories() -> list[dict[str, str]]:
    return [
        {"id": category_id, "label": label}
        for category_id, label in sorted(SCORING_CATEGORIES.items())
    ]
