// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Components.Infrastructure;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Microsoft.AspNetCore.Components.Endpoints;

internal partial class EndpointHtmlRenderer
{
    private static readonly object InvokedRenderModesKey = new object();

    public async ValueTask<IHtmlContent> PrerenderPersistedStateAsync(HttpContext httpContext, PersistedStateSerializationMode serializationMode)
    {
        SetHttpContext(httpContext);

        // First we resolve "infer" mode to a specific mode
        if (serializationMode == PersistedStateSerializationMode.Infer)
        {
            switch (GetPersistStateRenderMode(_httpContext))
            {
                case InvokedRenderModes.Mode.None:
                    return ComponentStateHtmlContent.Empty;
                case InvokedRenderModes.Mode.ServerAndWebAssembly:
                    throw new InvalidOperationException(
                        Resources.FailedToInferComponentPersistenceMode);
                case InvokedRenderModes.Mode.Server:
                    serializationMode = PersistedStateSerializationMode.Server;
                    break;
                case InvokedRenderModes.Mode.WebAssembly:
                    serializationMode = PersistedStateSerializationMode.WebAssembly;
                    break;
                default:
                    throw new InvalidOperationException("Invalid persistence mode");
            }
        }

        // Now given the mode, we obtain a particular store for that mode
        var store = serializationMode switch
        {
            PersistedStateSerializationMode.Server =>
                new ProtectedPrerenderComponentApplicationStore(_httpContext.RequestServices.GetRequiredService<IDataProtectionProvider>()),
            PersistedStateSerializationMode.WebAssembly =>
                new PrerenderComponentApplicationStore(),
            _ =>
                throw new InvalidOperationException("Invalid persistence mode.")
        };

        // Finally, persist the state and return the HTML content
        var manager = _httpContext.RequestServices.GetRequiredService<ComponentStatePersistenceManager>();
        await manager.PersistStateAsync(store, Dispatcher, static (_, _) => true);
        return new ComponentStateHtmlContent(
            serializationMode == PersistedStateSerializationMode.Server ? store : null,
            serializationMode == PersistedStateSerializationMode.WebAssembly ? store : null);
    }

    public async ValueTask<IHtmlContent> PrerenderPersistedStateAsync(HttpContext httpContext)
    {
        SetHttpContext(httpContext);

        var manager = _httpContext.RequestServices.GetRequiredService<ComponentStatePersistenceManager>();

        var serverStore = new ProtectedPrerenderComponentApplicationStore(_httpContext.RequestServices.GetRequiredService<IDataProtectionProvider>());
        await manager.PersistStateAsync(serverStore, Dispatcher, IncludeInServerStore);

        var webAssemblyStore = new PrerenderComponentApplicationStore();
        await manager.PersistStateAsync(webAssemblyStore, Dispatcher, IncludeInWebAssemblyStore);

        return new ComponentStateHtmlContent(serverStore, webAssemblyStore);

        bool IncludeInServerStore(object? target, IComponentRenderMode? componentRenderMode)
        {
            // If the registration specified a rendermode, use that to make the decision
            // If not, but the target is a component, match based on its rendermode
            // If not, just don't include the state
            if (componentRenderMode is not null)
            {
                return componentRenderMode is ServerRenderMode or AutoRenderMode;
            }
            else if (target is IComponent component && GetComponentState(component) is { } componentState)
            {
                var renderModeBoundary = GetClosestRenderModeBoundary(componentState.ComponentId);
                return renderModeBoundary is not null && renderModeBoundary.Mode is ServerRenderMode or AutoRenderMode;
            }
            else
            {
                // Alternatively we could return true here, since it's safe to put unmatched state in the server store
                return false;
            }
        }

        bool IncludeInWebAssemblyStore(object? target, IComponentRenderMode? componentRenderMode)
        {
            if (componentRenderMode is not null)
            {
                return componentRenderMode is WebAssemblyRenderMode or AutoRenderMode;
            }
            else if (target is IComponent component && GetComponentState(component) is { } componentState)
            {
                var renderModeBoundary = GetClosestRenderModeBoundary(componentState.ComponentId);
                return renderModeBoundary is not null && renderModeBoundary.Mode is WebAssemblyRenderMode or AutoRenderMode;
            }
            else
            {
                return false;
            }
        }
    }

    // Internal for test only
    internal static void UpdateSaveStateRenderMode(HttpContext httpContext, IComponentRenderMode? mode)
    {
        // TODO: This will all have to change when we support multiple render modes in the same response
        if (ModeEnablesPrerendering(mode))
        {
            var currentInvocation = mode switch
            {
                ServerRenderMode => InvokedRenderModes.Mode.Server,
                WebAssemblyRenderMode => InvokedRenderModes.Mode.WebAssembly,
                AutoRenderMode => throw new NotImplementedException("TODO: To be able to support AutoRenderMode, we have to serialize persisted state in both WebAssembly and Server formats, or unify the two formats."),
                _ => throw new ArgumentException(Resources.FormatUnsupportedRenderMode(mode), nameof(mode)),
            };

            if (!httpContext.Items.TryGetValue(InvokedRenderModesKey, out var result))
            {
                httpContext.Items[InvokedRenderModesKey] = new InvokedRenderModes(currentInvocation);
            }
            else
            {
                var invokedMode = (InvokedRenderModes)result!;
                if (invokedMode.Value != currentInvocation)
                {
                    invokedMode.Value = InvokedRenderModes.Mode.ServerAndWebAssembly;
                }
            }
        }
    }

    private static bool ModeEnablesPrerendering(IComponentRenderMode? mode) => mode switch
    {
        ServerRenderMode { Prerender: true } => true,
        WebAssemblyRenderMode { Prerender: true } => true,
        AutoRenderMode { Prerender: true } => true,
        _ => false
    };

    internal static InvokedRenderModes.Mode GetPersistStateRenderMode(HttpContext httpContext)
    {
        return httpContext.Items.TryGetValue(InvokedRenderModesKey, out var result)
            ? ((InvokedRenderModes)result!).Value
            : InvokedRenderModes.Mode.None;
    }

    private sealed class ComponentStateHtmlContent : IHtmlContent
    {
        private PrerenderComponentApplicationStore? _serverStore;
        private PrerenderComponentApplicationStore? _webAssemblyStore;

        public static ComponentStateHtmlContent Empty { get; }
            = new ComponentStateHtmlContent(null, null);

        public ComponentStateHtmlContent(PrerenderComponentApplicationStore? serverStore, PrerenderComponentApplicationStore? webAssemblyStore)
        {
            _serverStore = serverStore;
            _webAssemblyStore = webAssemblyStore;
        }

        public void WriteTo(TextWriter writer, HtmlEncoder encoder)
        {
            if (_serverStore != null && _serverStore.PersistedState is not null)
            {
                writer.Write("<!--Blazor-Server-Component-State:");
                writer.Write(_serverStore.PersistedState);
                writer.Write("-->");
                _serverStore = null;
            }

            if (_webAssemblyStore != null && _webAssemblyStore.PersistedState is not null)
            {
                writer.Write("<!--Blazor-WebAssembly-Component-State:");
                writer.Write(_webAssemblyStore.PersistedState);
                writer.Write("-->");
                _webAssemblyStore = null;
            }
        }
    }
}
