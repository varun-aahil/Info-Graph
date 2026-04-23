from pydantic import BaseModel


class GraphPointResponse(BaseModel):
    id: str
    x: float
    y: float
    documentName: str
    snippet: str
    cluster: int
    clusterLabel: str
    isAnomaly: bool


class ClusterSummaryResponse(BaseModel):
    id: int
    label: str
    documentCount: int


class GraphResponse(BaseModel):
    points: list[GraphPointResponse]
    clusters: list[ClusterSummaryResponse]
