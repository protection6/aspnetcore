export function beforeWebStart() {
    appendElement('modern-before-web-start', 'Modern "beforeWebStart"');
}

export function afterWebStarted() {
    appendElement('modern-after-web-started', 'Modern "afterWebStarted"');
}

export function beforeWebAssemblyStart() {
    appendElement('modern-before-web-assembly-start', 'Modern "beforeWebAssemblyStart"');
}

export function afterWebAssemblyStarted() {
    appendElement('modern-after-web-assembly-started', 'Modern "afterWebAssemblyStarted"');
}

export function beforeServerStart(options) {
    options.circuitHandlers.push({
        onCircuitOpened: () => {
            debugger;
            appendElement('modern-circuit-opened', 'Modern "circuitOpened"');
        },
        onCircuitClosed: () => appendElement('modern-circuit-closed', 'Modern "circuitClosed"')
    });
    appendElement('modern-before-server-start', 'Modern "beforeServerStart"');
}

export function afterServerStarted() {
    appendElement('modern-after-server-started', 'Modern "afterServerStarted"');
}

function appendElement(id, text) {
    var content = document.getElementById('initializers-content');
    if (!content) {
        return;
    }
    var element = document.createElement('p');
    element.id = id;
    element.innerText = text;
    content.appendChild(element);
}
