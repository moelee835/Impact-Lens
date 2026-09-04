"""M4 stage 3 corpus, sub-dependency (nested dependency) - the innermost dependency of a two-level
Depends() chain. `nested_dependency_db.py` depends on this via its own Depends(get_config); querying
`get_config` as root must find `get_db` as the candidate caller, not `handler`
(`nested_dependency_consumer.py`) - the direct Depends() reference at each level, not the whole
transitive chain, is what this adapter's own doc comment claims to support
("dependency 함수 내부의 sub-dependency 재귀... a dependency function's own Depends(...) parameters are
just another enclosing-function match of the same mechanism").
"""


def get_config():
    return {}
