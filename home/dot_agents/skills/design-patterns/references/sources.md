# Pattern research sources

Use these catalogs to find candidates, then read the relevant pattern pages.
The categories below are research entry points; select by the actual problem
and constraints of each module. Keep recommendations tied to the pages read.

## Refactoring.Guru: object design

Start with the [design pattern catalog](https://refactoring.guru/design-patterns/catalog).
It covers the 23 classic patterns in three families:

| Design concern | Catalog and candidates |
| --- | --- |
| Construction, related product families, assembly, copying, instance lifetime | [Creational patterns](https://refactoring.guru/design-patterns/creational-patterns): Factory Method, Abstract Factory, Builder, Prototype, Singleton |
| Interface compatibility, independent variation, trees, wrappers, access, shared state | [Structural patterns](https://refactoring.guru/design-patterns/structural-patterns): Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy |
| Algorithms, state-dependent behavior, operations, collaboration, traversal | [Behavioral patterns](https://refactoring.guru/design-patterns/behavioral-patterns): Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor |

For a shortlisted pattern, read its intent, applicability, implementation,
pros and cons, and relations to other patterns. Follow related patterns to
compare competing solutions and possible combinations. Translate the roles
into the project's language and domain before discussing an implementation.

Read [Criticism of patterns](https://refactoring.guru/design-patterns/criticism)
when judging whether extra structure earns its cost. A language feature can
already express the needed role, and simpler code can be sufficient.

## Martin Fowler: enterprise application design

Use the author's [Patterns of Enterprise Application Architecture catalog](https://martinfowler.com/eaaCatalog/)
when the problem involves business logic organization, persistence, transaction
coordination, or application interfaces. Relevant entries include Transaction
Script, Domain Model, Service Layer, Data Mapper, Repository, and Unit of Work.
Follow the individual entries and compare their assumptions with the project's
existing data model and consistency requirements.

## Enterprise Integration Patterns: messaging

Use the [messaging pattern catalog](https://www.enterpriseintegrationpatterns.com/patterns/messaging/)
when modules communicate through messages or asynchronous workflows. Explore
channels, routing, transformation, and endpoints; relevant entries include
Pipes and Filters, Content-Based Router, Splitter, Aggregator, Process Manager,
and Idempotent Receiver. Read the applicable entries to reason about the
particular delivery and coordination problem.

Keep the scale of a pattern explicit: object collaboration, application
organization, and messaging solve different parts of a design. Check runtime
and framework guarantees in their official documentation before relying on
them for an implementation.
