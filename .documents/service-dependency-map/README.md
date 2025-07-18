**IMPORTANT DISCLAIMER: CONTENTS OF THE MAP ARE CURRENTLY AI-GENERATED AND ARE NOT GUARANTEED TO BE ACCURATE. VERIFICATION AND CORRECTION ARE IN PROGRESS. THIS MESSAGE WILL BE REMOVED WHEN THE MAP IS CORRECT.**

# Service Dependency Map Generator

A Nix flake for generating visual service dependency maps from DOT files.

## Requirements

- [Nix package manager](https://nixos.org/download.html)
- Flakes enabled in your Nix configuration

### Enabling Flakes

Add to either `~/.config/nix/nix.conf` or `/etc/nix/nix.conf`:
```
experimental-features = nix-command flakes
```

## Usage

### Quick Start

This is a self-contained tool within the larger repository.

1. Navigate to the service dependency map directory:
```bash
cd .documents/service-dependency-map
```

2. Generate the dependency map:
```bash
nix run
```

This will create a `service-dependency-map.pdf` file from the included `map.dot` file.

### Development Environment

Start a shell with all dependencies:

```bash
nix develop
```

This provides access to Graphviz tools like `dot`.

### Custom DOT Files

1. Place your DOT file as `map.dot` in the directory
2. Run `nix run` to generate the PDF

### Building the Package

```bash
nix build
```

The PDF will be available in `./result/`.

## Features

- Renders service dependency diagrams with Graphviz
- Automatically formats for A4 paper
- Provides legend for dependency types:
  - Direct dependencies
  - Optional/contextual dependencies
  - Infrastructure dependencies
