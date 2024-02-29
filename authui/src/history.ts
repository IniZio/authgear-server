import { Controller } from "@hotwired/stimulus";

export class HistoryController extends Controller {
  get initialHistoryLength(): number {
    return Number(sessionStorage.getItem("history.initialLength")) || 0;
  }
  set initialHistoryLength(value: number | null) {
    if (value === null) {
      sessionStorage.removeItem("history.initialLength");
    } else {
      sessionStorage.setItem("history.initialLength", value.toString());
    }
  }

  get historyLength() {
    return Number(sessionStorage.getItem("history.length")) || history.length;
  }

  get currentStep(): number {
    return Number(sessionStorage.getItem("history.currentStep")) || 0;
  }
  set currentStep(value: number | null) {
    if (value === null) {
      sessionStorage.removeItem("history.currentStep");
    } else {
      sessionStorage.setItem("history.currentStep", value.toString());
    }
  }

  get popAllIsRunning() {
    return sessionStorage.getItem("history.popAllFlag");
  }
  set popAllIsRunning(value: string | null) {
    if (value === null) {
      sessionStorage.removeItem("history.popAllFlag");
    } else {
      sessionStorage.setItem("history.popAllFlag", value);
    }
  }

  connect() {
    if (!this.popAllIsRunning) {
      this.initialHistoryLength = this.initialHistoryLength || history.length;
    }

    // @ts-ignore
    window.popAll = this.popAll.bind(this);

    window.addEventListener("message", (event) => {
      if (event.data.type === "authgear:close") {
        console.log("authgear:close", event.data);
        const redirectURI = event.data.redirectURI;
        this.popAll(location.href, () => {
          location.replace(redirectURI);
        })
      }
    });
  }

  popAll(href: string, cb: () => void) {
    if (this.popAllIsRunning) {
      return;
    }
    this.popAllIsRunning = "true";

    const pages = Math.abs(this.historyLength - this.initialHistoryLength);
    console.log("popAll", this.historyLength, this.initialHistoryLength);
    if (pages === 0) {
      this.initialHistoryLength = null;
      this.currentStep = null;
      this.popAllIsRunning = null;
      cb();
      return;
    }

    this.currentStep = 0;
    const onPopState = () => {
      this.currentStep++;

      console.log("pop", pages, this.currentStep, location.href)

      if (pages > this.currentStep) {
        history.replaceState({}, "", href);
        history.go(-1);
      } else if (pages === this.currentStep) {
        history.replaceState({}, "", href);
        history.go(pages);
      } else {
        console.log("leaving")
        window.removeEventListener('popstate', onPopState);
        this.initialHistoryLength = null;
        this.currentStep = null;
        this.popAllIsRunning = null;
        cb();
      }
    }
    window.addEventListener('popstate', onPopState);
    history.back();
  }
}
