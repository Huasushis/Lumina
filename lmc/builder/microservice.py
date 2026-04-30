"""Microservice builder — multi-process assembly with Docker + IPC."""

from __future__ import annotations

from pathlib import Path

from lmc.agents.base import GeneratedFiles
from lmc.builder.monolith import BuildResult


class MicroserviceBuilder:
    """Assembles modules into independent services with Docker."""

    def build(self, modules: dict[str, GeneratedFiles],
              output_dir: Path,
              target_language: str = "python") -> BuildResult:
        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        services: dict[str, int] = {}

        for idx, (mod_name, gen_files) in enumerate(modules.items()):
            svc_dir = output_dir / mod_name
            svc_dir.mkdir(exist_ok=True)

            for gf in gen_files.files:
                file_path = svc_dir / gf.path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(gf.content, encoding="utf-8")

            # Generate Dockerfile
            _write_dockerfile(svc_dir, mod_name, target_language)
            port = 8000 + idx
            services[mod_name] = port

        # Generate docker-compose
        _write_compose(output_dir, services)
        # Generate network config
        _write_network_config(output_dir, services)

        return BuildResult(
            success=True,
            output_path=output_dir,
            entry_point="docker compose up",
            artifacts=list(output_dir.rglob("*")),
        )


def _write_dockerfile(svc_dir: Path, name: str, language: str):
    dockerfile = f'''FROM {"python:3.11-slim" if language == "python" else "ubuntu:22.04"}

WORKDIR /app
COPY . /app

RUN pip install --no-cache-dir .

EXPOSE 8080
CMD ["python", "-m", "{name.lower()}_service"]
'''
    (svc_dir / "Dockerfile").write_text(dockerfile)


def _write_compose(output_dir: Path, services: dict[str, int]):
    lines = ['version: "3.8"', "", "services:"]
    for name, port in services.items():
        lines.append(f"  {name}:")
        lines.append(f"    build: ./{name}")
        lines.append(f"    ports:")
        lines.append(f'      - "{port}:8080"')
        lines.append(f"    networks:")
        lines.append(f"      - lumina-net")
        lines.append("")

    lines.append("networks:")
    lines.append("  lumina-net:")
    lines.append("    driver: bridge")

    (output_dir / "docker-compose.yml").write_text(
        "\n".join(lines), encoding="utf-8")


def _write_network_config(output_dir: Path, services: dict[str, int]):
    """Service discovery via JSON config."""
    hosts = {name: f"http://{name}:8080" for name in services}
    import json
    (output_dir / "services.json").write_text(
        json.dumps(hosts, indent=2), encoding="utf-8")
