"""Use only the engine's public contract; never fabricate a calculation."""
from packages import engine

from apps.api.errors import ApiProblem


def calculate(function, *args):
    try:
        return function(*args)
    except engine.EngineError as error:
        code = error.code
        # Detail comes from the engine, which has no confidential data or network.
        raise ApiProblem(
            409 if "LOCK" in code else 422,
            code,
            "Calculation rejected",
            error.detail,
        ) from None
