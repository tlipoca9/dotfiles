# Module and Interface Judgment

Use this reference when responsibility placement, interface shape, or testing
boundaries are part of the problem. Apply its distinctions using the project's
existing vocabulary; do not rename established services, APIs, or domain
boundaries just to match these terms.

## Vocabulary

- **Module**: a function, class, package, or larger coherent unit with an
  implementation and an interface through which callers use it.
- **Interface**: everything callers must know to use a module correctly,
  including signatures, invariants, ordering, errors, configuration, ownership,
  and relevant performance characteristics.
- **Implementation**: the behavior and mechanisms behind that interface.
- **Depth**: useful behavior available for the amount of interface knowledge a
  caller needs. Depth is not a ratio of implementation lines to interface lines.
- **Seam**: a location where behavior can be substituted without editing its
  consumers. It may be internal to a module or exposed to callers.
- **Adapter**: an implementation that fills a role at a seam; the term describes
  its role, not its size or whether it contains substantial behavior.
- **Leverage**: the useful capability callers gain for the concepts they learn.
- **Locality**: the extent to which related knowledge, changes, bugs, and
  verification remain concentrated in one place.

## Find the responsibility that earns its place

A module is useful when it hides necessary complexity behind a clear interface.
Evaluate the burden across callers and maintainers, not just the apparent
cleanliness of one file. A tiny function that exposes every implementation
detail can increase the total amount people must understand.

Apply the **deletion test**: imagine removing the module while preserving the
behavior. If an indirection disappears and complexity falls, it may not earn its
place. If the same rules spread across callers, the module was concentrating
useful knowledge. A small adapter can still be justified by isolation of a real
external dependency or costly change boundary.

State what the module owns, how callers use it, and what it depends on. Keep
closely related rules together. Separate responsibilities when they change for
different observed reasons or require distinct ownership, lifecycle, failure,
or resource management. Neither small files nor fewer modules are goals alone.

Choose package boundaries after establishing business responsibilities and real
change points. Files can organize behavior without creating another public package.
Use the surrounding path to keep names short and specific; do not concatenate
object, action, and implementation role, or group unrelated work under a broad
technical label merely to reduce directory width.

## Make correct use straightforward

Minimize unnecessary concepts, methods, parameters, ordering constraints, and
configuration. Hide internal coordination when callers do not need to control
it. Prefer explicit ownership and clear results; keep side effects visible at
the boundaries where they matter. Inject dependencies when that creates useful
control or isolation, rather than imposing injection on every constructor.

Introduce a seam for actual variation, dependency isolation, or a meaningful
verification need. Compare its cognitive and maintenance cost with the
complexity it removes. Adapter count is neither a prerequisite nor proof of
value; speculative implementations do not justify an abstraction. Keep internal
seams private unless callers have a current reason to use them.

When alternatives genuinely matter, compare a few materially different
interfaces against the same scenarios, constraints, and usage examples.
Consider caller knowledge, locality, failure handling, and dependency cost.
Independent designs can expose blind spots; do not force a fixed number of
options or add flexibility merely to create a contrast.

For a proposed extension point, walk through a concrete change: what must a caller
learn, which existing files change, and which new implementations are necessary?
Separate the interface's initial cost from the cost of each additional use. A
future scenario tests the design; it does not authorize implementing that feature.

## Verify behavior through useful boundaries

Use the caller-facing interface as the default test surface. Choose the layer
that exercises the claimed behavior, including interactions across callers when
the bug or contract depends on them. Internal tests remain useful when they
protect a durable invariant that broader tests cannot isolate effectively.

Pure in-process behavior often needs no adapter. For I/O, choose a real local
dependency, compatible stand-in, injected transport, or external-service mock
according to the behavior being claimed and execution cost. A substitute only
proves behavior within its fidelity; verify relevant real-boundary guarantees
with integration or contract checks. Do not expose a port solely because a test
could mock it.

During restructuring, preserve behavior and meaningful regression coverage.
Replace old tests only after equivalent or stronger coverage actually exists;
do not delete tests simply because their former module disappeared. Prefer
assertions on observable outcomes over call counts or internal layout when
those details are not contractual. Tests should survive reasonable internal
refactoring while remaining capable of catching the protected failure.
