# Go Integration Pseudocode

This reference maps the platform contract to the recommended Go libraries. The snippets are deliberately incomplete: adapt types, error packages, logging, metrics, and dependency injection to the target repository.

## Contents

- [Recommended packages](#recommended-packages)
- [Core ports](#core-ports)
- [Client construction](#client-construction)
- [Request and CAM context](#request-and-cam-context)
- [Single-resource authorization](#single-resource-authorization)
- [List filtering](#list-filtering)
- [Tag reading](#tag-reading)
- [Custom Tag mutation](#custom-tag-mutation)
- [Optional creator Tag](#optional-creator-tag)
- [Optional cache](#optional-cache)

## Recommended packages

Use these package families for the concrete adapters when compatible with the target repository:

| Package | Role |
|---|---|
| `git.woa.com/tke-library/cloud-client-go/cam` | CAM HTTP/Polaris client and CAM error codes |
| `git.woa.com/tke-library/services/cam` | `SigAndAuth` and wildcard-aware resource filtering |
| `git.woa.com/tke-library/context/request` | YunAPI request context |
| `git.woa.com/tke-library/context/cam` | decoded CAM context and Role details |
| `git.woa.com/tke-library/cloud-client-go/tag` | Tag reader interface |
| `git.woa.com/tke-library/cloud-client-go/tag/v2` | concurrent live Tag reader |
| `git.woa.com/tke-library/cloud-client-go/qcloud` | WTag and system-Tag POST operations |
| `git.woa.com/tke-library/cloud-client-go/polaris` | Polaris component wiring |
| `git.woa.com/polaris/polaris-go/v2/api` | shared Polaris consumer API |

Inspect the target module's existing versions before editing dependencies. Preserve a compatible version already selected by the repository unless the required API is absent.

## Core ports

Keep business handlers dependent on narrow ports, not concrete clients:

```go
// Pseudocode: names and result types are repository-specific.
type ResourceSpec struct {
    ServiceType   string
    ResourceType  string
    ResourcePrefix string
    Actions       map[string]ActionSpec
    CreatorTag    bool
}

type CAMAuthorizer interface {
    Authorize(ctx context.Context, req YunAPIRequest, resourceID string, requestTags []Tag) error
    Filter(ctx context.Context, req YunAPIRequest, candidateIDs []string) (FilteredResources, error)
}

type TagReader interface {
    Read(ctx context.Context, resources []string) (map[string][]Tag, error)
}

type TagWriter interface {
    Modify(ctx context.Context, ownerUIN, creatorUIN, resource string, replace, delete []Tag) error
}

type CreatorTagWriter interface {
    Attach(ctx context.Context, ownerUIN, creatorUIN, resource string) error
    Detach(ctx context.Context, ownerUIN, creatorUIN, resource string) error
}
```

Do not put product database access, pagination, or resource lifecycle calls inside these clients.

## Client construction

Construct one shared Polaris consumer, but keep four configured roles: CAM Auth, CAM List, Tag read, and Tag write.

```go
// Pseudocode using cloud-client-go APIs.
consumer := cloudpolaris.GetConsumerAPI()

camClient := cloudcam.NewClient(cloudcam.Options{
    AuthURL: cfg.CAMAuth.Endpoint,
    ListURL: cfg.CAMList.Endpoint,
    Polaris: &cloudcam.PolarisOptions{
        ConsumerAPI: consumer,
        Namespace: cfg.CAMAuth.Namespace,
        AuthService: cfg.CAMAuth.Service,
        ListService: cfg.CAMList.Service,
        ReportCallResult: true,
    },
    Client: instrumentedHTTPClient,
})

tagReader := tagv2.NewConcurrentClient(
    tagv2.WithURL(cfg.TagRead.Endpoint),
    tagv2.WithPolaris(&cloudpolaris.Component{
        ConsumerAPI: consumer,
        Namespace: cfg.TagRead.Namespace,
        Service: cfg.TagRead.Service,
        ReportCallResult: true,
    }),
    tagv2.WithHTTPClient(instrumentedHTTPClient),
    tagv2.WithConcurrency(boundedReadConcurrency),
)

camService := servicecam.NewService(servicecam.Options{
    CamClient: camClient,
    TagClient: tagReader,
})

tagWriteClient := qcloud.NewClient(qcloud.Options{
    URL: cfg.TagWrite.Endpoint,
    Polaris: &cloudpolaris.Component{
        ConsumerAPI: consumer,
        Namespace: cfg.TagWrite.Namespace,
        Service: cfg.TagWrite.Service,
        ReportCallResult: true,
    },
    Client: instrumentedHTTPClient,
})
```

Validate configuration at startup. Require CAM Auth and CAM List when internal CAM is enabled. Require Tag read and write independently according to the Action capability table.

## Request and CAM context

Normalize the YunAPI request before calling CAM:

```go
func prepareCAMContext(ctx context.Context, req YunAPIRequest) (context.Context, Prepared, error) {
    requireNonEmpty(req.Action, req.Region, req.OwnerUIN, req.RequestID, req.CamContext)
    appID := parseUint64(req.AppID)

    requestCtx := &cloudrequest.Context{
        Action: req.Action,
        Region: req.Region,
        ClientIP: req.ClientIP,
        AppID: appID,
        Uin: req.OwnerUIN,
        SubUin: req.SubAccountUIN,
        RequestID: req.RequestID,
        RequestSource: req.RequestSource,
        ForceAuth: true,
    }
    ctx = cloudrequest.NewContext(ctx, requestCtx)

    var camCtx cloudcam.Context
    if err := json.Unmarshal([]byte(req.CamContext), &camCtx); err != nil {
        return nil, Prepared{}, markAuthenticationContextError(err)
    }
    ctx = cloudcam.NewContext(ctx, &camCtx)

    return ctx, Prepared{
        Region: req.Region,
        OwnerUIN: req.OwnerUIN,
        RoleDetail: camCtx.RoleDetail,
    }, nil
}
```

If the product declares main-account bypass, check `OwnerUIN == SubAccountUIN` before requiring a sub-account CAM context.

## Single-resource authorization

Build resources structurally instead of concatenating policy strings in handlers:

```go
func camResource(spec ResourceSpec, prepared Prepared, id string) servicecam.Resource {
    return servicecam.Resource{
        ServiceType: spec.ServiceType,
        Region: prepared.Region,
        Uin: prepared.OwnerUIN,
        ResourceType: spec.ResourceType,
        ResourceID: id,
    }
}

func authorize(ctx context.Context, req YunAPIRequest, id string, requestTags []Tag) error {
    camCtx, prepared := prepareCAMContext(ctx, req)
    sdkTags := toSDKTags(requestTags)
    err := camService.SigAndAuth(camCtx, &servicecam.AuthInfo{
        Resources: []servicecam.Resource{camResource(spec, prepared, id)},
        Tags: sdkTags,
    })
    switch {
    case err == nil:
        return nil
    case qcloudCode(err) == cloudcam.ErrNoPermission:
        return unauthorized(req.Action, publicQCS(spec, req.Region, id), req.RequestID)
    case isMissingRequestOrCAMContext(err):
        return authenticationContextFailure(err)
    default:
        return camUnavailable(err)
    }
}
```

Use `id="*"` for Create. Pass request Tags only if the Action declares that axis.

## List filtering

Fetch raw candidates without applying public pagination, then filter:

```go
func listAuthorized(ctx context.Context, req YunAPIRequest, offset, limit int) (ListResult, error) {
    candidates := repository.FindAllCandidates(ctx, req.OwnerUIN)
    if isMainAccount(req) {
        return paginate(candidates, offset, limit), nil
    }

    camCtx, prepared := prepareCAMContext(ctx, req)
    resources := mapEach(candidates, func(item Resource) servicecam.Resource {
        return camResource(spec, prepared, item.ID)
    })
    filtered, err := camService.FilterByCheckResourceWithWildcardARN(
        camCtx,
        &servicecam.AuthInfo{Resources: resources},
    )
    if qcloudCode(err) == cloudcam.ErrNoPermission {
        return ListResult{}, unauthorized(req.Action, publicQCS(spec, req.Region, "*"), req.RequestID)
    }
    if err != nil {
        return ListResult{}, camUnavailable(err)
    }

    allowed := retainCandidateOrder(candidates, filtered.Resources)
    attachReturnedTags(allowed, filtered.TagsMap)
    return paginate(allowed, offset, limit), nil // TotalCount == len(allowed)
}
```

An empty `filtered.Resources` with no error is a successful empty list. It is not an unauthorized response.

## Tag reading

Use the exact internal QCS for Tag reads:

```go
func internalQCS(spec ResourceSpec, region, ownerUIN, id string) string {
    return fmt.Sprintf(
        "qcs::%s:%s:uin/%s:%s/%s",
        spec.ServiceType, region, ownerUIN, spec.ResourcePrefix, id,
    )
}

func readTags(ctx context.Context, ids []string) (map[string][]Tag, error) {
    resources := mapIDsToInternalQCS(ids)
    raw, err := tagReader.GetResourcesTagsMap(ctx, resources)
    if err != nil {
        return nil, markTagUnavailable(err) // fail closed when used for auth/response
    }
    return normalizeAndSort(raw), nil
}
```

Never turn a read error into an empty map. An actual untagged resource is represented by a successful read with an empty Tag list.

## Custom Tag mutation

Define the current wire contract in one adapter:

```go
const modifyResourceTags = "qcloud.tag.modifyResourceTags"

type modifyRequest struct {
    UIN         string    `json:"uin"`
    CreatorUIN  string    `json:"createUin"`
    Resource    string    `json:"resource"`
    ReplaceTags []wireTag `json:"replaceTags,omitempty"`
    DeleteTags  []wireTag `json:"deleteTags,omitempty"`
}

func modify(ctx context.Context, owner, creator, resource string, replace, delete []Tag) error {
    if len(replace) == 0 && len(delete) == 0 { return nil }
    acquireBoundedWriteSlot(ctx)
    return tagWriteClient.Post(ctx, modifyResourceTags, modifyRequest{
        UIN: owner,
        CreatorUIN: creator,
        Resource: resource,
        ReplaceTags: toWire(replace),
        DeleteTags: toWire(delete),
    }, nil)
}
```

Compute replacement by key and exclude creator Tag:

```go
func difference(current, wanted []Tag) (replace, delete []Tag) {
    current = customTagsOnly(current)
    wanted = customTagsOnly(wanted)
    currentByKey := indexByKey(current)
    wantedByKey := indexByKey(wanted)

    for _, desired := range wanted {
        old, found := currentByKey[desired.Key]
        if !found || old.Value != desired.Value {
            replace = append(replace, desired)
        }
    }
    for _, old := range current {
        if _, found := wantedByKey[old.Key]; !found {
            delete = append(delete, old)
        }
    }
    sortTags(replace)
    sortTags(delete)
    return replace, delete
}
```

For a changed value, send only the new pair in `replaceTags`. Never send the old pair in `deleteTags` in the same request.

Preserve whether a Modify request supplied its Tags field:

```go
// Pseudocode: use a pointer, nullable wrapper, or decoder presence bit.
if !req.Tags.Present {
    // Leave existing custom Tags unchanged.
    return nil
}
wanted := validateUniqueCustomTags(req.Tags.Value)
current := readTags(ctx, []string{req.ResourceID})
replace, delete := difference(current[req.ResourceID], wanted)
return modify(ctx, ownerUIN, creatorUIN, resourceQCS, replace, delete)
```

An explicitly present empty list clears custom Tags. An omitted field is a no-op. Reject duplicate keys and `qcs:tag:createdBy` before authorization or mutation.

## Optional creator Tag

Keep this adapter absent when the resource has not enabled creator Tags:

```go
const (
    attachCreator = "qcloud.system.AttachResourceSystemTag"
    detachCreator = "qcloud.system.DetachResourceSystemTag"
    creatorTagKey = "qcs:tag:createdBy"
)

attachPayload := map[string]any{
    "uin": ownerUIN,
    "createUin": creatorUIN,
    "resourceList": []string{resourceQCS},
    "tags": []wireTag{{Key: creatorTagKey}},
}

detachPayload := map[string]any{
    "uin": ownerUIN,
    "createUin": creatorUIN,
    "resourceList": []string{resourceQCS},
    "tagKeys": []string{creatorTagKey},
}
```

Attach after the business resource is committed. Detach and delete custom Tags only after business deletion is committed. Do not let custom Tag clear remove the creator Tag.

## Optional cache

Put caching around single-resource authorization, not around List or Tag reads:

```go
stableKeyInput := struct {
    AppID, OwnerUIN, SubUIN string
    Action, Region, RequestSource string
    ResourceQCS string
    Role stableRoleFields
    SortedRequestTags []Tag
}{...}
key := sha256(canonicalJSON(stableKeyInput))

if decision, found := localCache.Get(key); found { return decision }
if distributedCache != nil {
    if decision, found, err := distributedCache.Get(ctx, key); err == nil && found {
        localCache.Set(key, decision, localTTL)
        return decision
    }
}

decision := callCAMDirectly()
bestEffortStoreCaches(key, decision)
return decision
```

Use stable Role identity fields, not the complete CAM context. On any cache failure, call CAM directly. Make TTLs configuration, document their maximum propagation effect, and test allow/deny isolation.
