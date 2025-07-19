{
  description = "Service Dependency Map Generator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-25.05-darwin";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = {
          default = self.packages.${system}.dependency-map;
          dependency-map = pkgs.stdenv.mkDerivation {
            name = "service-dependency-map";
            src = ./.;
            buildInputs = [
              pkgs.graphviz
            ];
            buildPhase = ''
              ${pkgs.python3}/bin/python resolve_deps.py
              ${pkgs.graphviz}/bin/dot -Tpdf map.dot -o service-dependency-map.pdf
            '';
            installPhase = ''
              mkdir -p $out
              cp service-dependency-map.pdf $out/
            '';
          };
        };

        apps = {
          default = self.apps.${system}.generate-map;
          generate-map = {
            type = "app";
            program = toString (pkgs.writeScript "generate-map" ''
              #!${pkgs.bash}/bin/bash
              if [ ! -f "map.dot" ]; then
                echo "Error: map.dot file not found in current directory"
                exit 1
              fi
              
              ${pkgs.python3}/bin/python resolve_deps.py
              ${pkgs.graphviz}/bin/dot -Tpdf map.dot -o service-dependency-map.pdf
              echo "Generated service-dependency-map.pdf from map.dot"
            '');
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.graphviz
          ];
        };
      }
    );
}
