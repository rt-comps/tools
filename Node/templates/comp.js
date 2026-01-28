// ================================================================
// === <compName>
//
// ***Provide description of component function here***
// 
const [compName, compPath] = rtlib.parseCompURL(import.meta.url);

customElements.define(
    compName,
    class extends rtBC.RTBaseClass {
        // Declare private class fields
        #_sR;

        //+++ Lifecycle Events
        //--- Contructor
        constructor() {
            // Attach contents of template previously placed in document.head
            super()
            this.#_sR = this.attachShadow({ mode: "open" });
            this.#_sR.append(this.$getTemplate())

            //### Listeners
        }
        //+++ End OF Lifecycle Events

        // Put private and public methods HERE

    }
);