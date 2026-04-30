"""Agent backend abstraction and shared data models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path


class AgentCapability(Enum):
    GENERATE = auto()
    TEST = auto()


@dataclass
class GeneratedFile:
    path: str  # relative path in working directory
    content: str


@dataclass
class GeneratedFiles:
    task_id: str
    files: list[GeneratedFile] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class TestResult:
    passed: bool
    output: str = ""
    coverage: float | None = None


class AgentError(Exception):
    """Base for agent-level errors."""


class AgentTimeoutError(AgentError):
    """Agent timed out."""


class AgentResponseError(AgentError):
    """Agent returned an unparseable response."""


class AgentBackend(ABC):
    """Pluggable code generation agent backend."""

    name: str = "base"
    capabilities: set[AgentCapability] = {AgentCapability.GENERATE}

    @abstractmethod
    def generate(self, prompt: str, work_dir: Path) -> GeneratedFiles:
        """Generate source code from a prompt. Must be implemented."""
        ...

    def test(self, task_id: str, files: GeneratedFiles,
             work_dir: Path) -> TestResult | None:
        """Run tests on generated code. Default: not supported."""
        if AgentCapability.TEST not in self.capabilities:
            return None
        return self._run_tests(task_id, files, work_dir)

    def _run_tests(self, task_id: str, files: GeneratedFiles,
                   work_dir: Path) -> TestResult:
        """Override in agents that support testing."""
        raise NotImplementedError
