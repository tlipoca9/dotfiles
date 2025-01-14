# Packages

## Type

### script

The `script` package type is used to install packages using a script.

It has the following properties:
- `enable` (boolean, required): Whether to install the package.
- `checker` (object, required): The checker to use to determine if the package is installed.
- `checker.type` (string, required): The type of checker to use. Currently, the supported types are `command` and `script`.
- `checker.command` (string, optional): The command that will be checked for existence. This is only required if the checker type is `command`.
- `checker.script` (string, optional): The script to run to check if the package is installed. It should return `0` if the package is installed. This is only required if the checker type is `script`.
- `installer` (string, required): The script to run to install the package.

The following is an example of a `script` package:

```toml
[packages.homebrew]
enabled = true
type = "script"
checker = { type = "command", command = "brew" }
installer = """
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
"""
```

### homebrew

The `homebrew` package type is used to install packages using the Homebrew package manager.

It only runs when the `homebrew` package manager is installed.

It has the following properties:
- `enable` (boolean, required): Whether to install the package.
- `checker` (object, required): The checker to use to determine if the package is installed.
- `checker.type` (string, required): The type of checker to use. Currently, the supported types are `command`, `font`, `script` and `cask`.
- `checker.command` (string, optional): The command that will be checked for existence. This is only required if the checker type is `command`.
- `checker.font` (string, optional): The font that will be checked for existence. This is only required if the checker type is `font`.
- `checker.script` (string, optional): The script to run to check if the package is installed. It should return `0` if the package is installed. This is only required if the checker type is `script`.
- `checker.cask` (string, optional): The cask that will be checked for existence. This is only required if the checker type is `cask`.
- `installer` (object, required): The installer to use to install the package.
- `installer.type` (string, required): The type of installer to use. Currently, the supported types are `formula` and `cask`.

The following is an example of a `homebrew` package:

```toml
[packages.git]
enabled = true
type = "homebrew"
checker = { type = "command", command = "git" }
installer = { type = "formula" }
```
