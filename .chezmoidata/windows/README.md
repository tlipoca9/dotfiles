# Packages

## Type

### custom

The `custom` package type is used to install packages using a custom script.

### scoop

The `scoop` package type is used to install packages using the Scoop package manager.

It only runs when the `scoop` package manager is installed.

It has the following properties:
- `enable` (boolean, required): Whether to install the package.
- `checker` (object, required): The checker used to determine if the package is installed.
- `checker.type` (string, required): The type of checker to use. Currently, the supported types are `command`, `font` and `script`.
- `checker.command` (string, optional): The command that will be checked for existence. This is only required if the checker type is `command`.
- `checker.font` (string, optional): The font that will be checked for existence. This is only required if the checker type is `font`.
- `checker.script` (string, optional): The script to run to check if the package is installed. It should return `0` if the package is installed. This is only required if the checker type is `script`.
