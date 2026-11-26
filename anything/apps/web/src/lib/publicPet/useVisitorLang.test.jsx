import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useRootVisitorLang, useVisitorLang } from "./useVisitorLang";
import { LANG_STORAGE_KEY, getVisitorLang, resetVisitorLang } from "./langStore";
import { documentLang } from "@/lib/home/meta";

const browserSpeaks = (...languages) =>
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);

function Page({ name = "page" }) {
  const { lang, setLang } = useVisitorLang();
  return (
    <div>
      <p data-testid={name}>{lang}</p>
      <button type="button" onClick={() => setLang(lang === "es" ? "en" : "es")}>
        switch {name}
      </button>
    </div>
  );
}

beforeEach(() => window.history.replaceState(null, "", "/provider"));
afterEach(() => vi.restoreAllMocks());

describe("useVisitorLang", () => {
  it("shares one choice between every component on the page", () => {
    browserSpeaks("es-AR");
    render(
      <>
        <Page name="shell" />
        <Page name="screen" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "switch shell" }));
    expect(screen.getByTestId("screen")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
    expect(window.location.search).toBe("?lang=en");
  });

  it("remembers the choice for the next visit, over the browser's language", () => {
    browserSpeaks("es-AR");
    const first = render(<Page />);
    fireEvent.click(screen.getByRole("button"));
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
    first.unmount();

    // A new visit: nothing in memory or in the address, only what the browser stored.
    resetVisitorLang();
    window.localStorage.setItem(LANG_STORAGE_KEY, "en");
    window.history.replaceState(null, "", "/p/tag/abc");
    render(<Page />);
    expect(screen.getByTestId("page")).toHaveTextContent("en");
  });

  it("keeps ?lang while moving around the page, without remembering it", () => {
    browserSpeaks("es-AR");
    window.history.replaceState(null, "", "/provider?lang=en");
    expect(getVisitorLang()).toBe("en");
    window.history.replaceState(null, "", "/provider/bookings");
    expect(getVisitorLang()).toBe("en");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
  });

  it("still switches when browser storage is unavailable", () => {
    browserSpeaks("es-AR");
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    render(<Page />);
    expect(screen.getByTestId("page")).toHaveTextContent("es");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("page")).toHaveTextContent("en");
    window.history.replaceState(null, "", "/provider/staff");
    expect(getVisitorLang()).toBe("en");
  });
});

describe("<html lang> from the server render to the browser", () => {
  function Root({ search = "" }) {
    const pathname = "/provider";
    const lang = useRootVisitorLang(pathname, search);
    return <main data-lang={documentLang(pathname, search, lang)} />;
  }

  it.each([
    ["", "es-AR"],
    ["?lang=en", "en"],
  ])("server render with %j is %s", (search, expected) => {
    browserSpeaks("en-US");
    expect(renderToString(<Root search={search} />)).toContain(`data-lang="${expected}"`);
  });

  it("hydrates without a mismatch, then takes the viewer's language", async () => {
    browserSpeaks("en-US");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Root />);
    expect(container.firstChild.dataset.lang).toBe("es-AR");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    let root;
    await act(async () => {
      root = hydrateRoot(container, <Root />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(container.firstChild.dataset.lang).toBe("en");
    act(() => root.unmount());
  });
});
