import os
import re
import hashlib

SERVICES_DIR = "../../src/services"

GRAPHVIZ_GRAPH_SETTINGS = """
    rankdir=LR;
    overlap=false;
    splines=true;
    node [shape=box, style="rounded,filled", fillcolor=lightblue, fontname="Arial"];
    edge [fontname="Arial", fontsize=10];
"""

def get_ts_files(dir_path: str) -> list[str]:
    """
    Returns a list of all .ts files in the given directory, excluding .test.ts files.
    """
    return [f for f in os.listdir(dir_path) if f.endswith('.ts') and not f.endswith('.test.ts')]

def get_service_names(ts_files: list[str]) -> list[str]:
    """
    Strips the .ts extension from the given list of .ts files.
    """
    return [file.replace('.ts', '') for file in ts_files]

def get_service_dependencies(service_file: str) -> list[str]:
    """
    Returns a list of service names that the given service depends on.
    """
    with open(service_file, 'r') as file:
        content = file.read()
        # Find imports from the same directory (starting with './')
        import_pattern = re.compile(r'import\s+(?:{[^}]*}|\w+)\s+from\s+[\'"]\.\/([^\'"]+)[\'"]')
        matches = import_pattern.findall(content)
        
        # Extract service names from the import paths
        service_names = []
        for match in matches:
            # Remove file extension if present
            service_name = match.replace('.ts', '')
            service_names.append(service_name)
            
        return service_names

def resolve_deps(service_names: list[str]) -> dict[str, list[str]]:
    """
    Returns a dictionary of service names and their dependencies.
    """
    deps = {}
    for service_name in service_names:
        deps[service_name] = get_service_dependencies(f"{SERVICES_DIR}/{service_name}.ts")
    return deps

def generate_graphviz_graph(deps: dict[str, list[str]]) -> str:
    """
    Generates a Graphviz graph of the dependencies using hashed node names.
    """
    graph = "digraph G {\n"
    graph += GRAPHVIZ_GRAPH_SETTINGS
    
    # Create mapping of service name to hash
    hash_map = {}
    for service_name in deps.keys():
        # Create a short hash (first 8 chars) of the service name
        hashed_name = '_' + hashlib.md5(service_name.encode()).hexdigest()[:8]
        hash_map[service_name] = hashed_name
        # Add node with hash as ID but service name as label
        graph += f'    {hashed_name} [label="{service_name}"];\n'
    
    # Add dependencies using hashed names
    for service_name, dependencies in deps.items():
        service_hash = hash_map[service_name]
        for dependency in dependencies:
            if dependency in hash_map:  # Only add if the dependency exists
                dependency_hash = hash_map[dependency]
                graph += f"    {service_hash} -> {dependency_hash}\n"
    
    graph += "}"
    return graph

def save_graphviz_graph(graph: str, output_file: str):
    """
    Saves the Graphviz graph to a file.
    """
    with open(output_file, 'w') as file:
        file.write(graph)

def main():
    ts_files = get_ts_files(SERVICES_DIR)
    service_names = get_service_names(ts_files)
    deps = resolve_deps(service_names)
    graph = generate_graphviz_graph(deps)
    save_graphviz_graph(graph, "map.dot")

if __name__ == "__main__":
    main()