export function beforeStart(options) {
    appendElement('classic-before-start', 'Classic "beforeStart"');
    console.log('Classic "beforeStart"');
}

export function afterStarted() {
    appendElement('classic-after-started', 'Classic "afterStarted"');
    console.log('Classic "afterStarted"');
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
