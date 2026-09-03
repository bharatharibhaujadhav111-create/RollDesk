"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  MapPin,
  Users,
  UserRound,
  X,
} from "lucide-react";
import {
  useGetSearchSuggestions,
  useHealthCheck,
  useSearchElectoralRoll,
  type SearchResult,
} from "@workspace/api-client-react";
import {
  getGetSearchSuggestionsQueryKey,
  getSearchElectoralRollQueryKey,
} from "@workspace/api-client-react";

const PAGE_SIZE = 10;

function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function SkeletonRows() {
  return (
    <div
      className="space-y-3"
      aria-label="Loading search results"
      data-testid="loading-search-results"
    >
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="h-[126px] animate-pulse rounded-xl border border-border bg-card/70"
        />
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const fileUrl = `/api/files/${encodeURIComponent(result.pdfId)}`;
  return (
    <article
      data-testid={`card-result-${result.id}`}
      className="group rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-secondary px-2 py-1 font-mono-app text-[10px] font-bold uppercase tracking-[.1em] text-secondary-foreground">
              Roll record
            </span>
            {result.matchedBy?.map((match) => (
              <span
                key={match}
                className="font-mono-app text-[10px] uppercase tracking-[.08em] text-accent"
              >
                {match}
              </span>
            ))}
          </div>
          <h3 className="truncate text-lg font-bold tracking-[-0.025em] text-foreground">
            {result.voterName}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound size={14} /> {result.relativeLabel || "Relative"}:{" "}
            <span className="font-medium text-foreground/80">
              {result.relativeName}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono-app text-[10px] uppercase tracking-[.08em] text-muted-foreground">
            {result.serialNumber && (
              <span>
                Serial <b className="text-foreground">{result.serialNumber}</b>
              </span>
            )}
            {result.houseNumber && (
              <span>
                House <b className="text-foreground">{result.houseNumber}</b>
              </span>
            )}
            {result.age !== null && result.age !== undefined && (
              <span>
                Age <b className="text-foreground">{result.age}</b>
              </span>
            )}
            {result.gender && (
              <span>
                Gender <b className="text-foreground">{result.gender}</b>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-4 sm:text-right">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              Match
            </p>
            <p className="mt-1 font-mono-app text-sm font-bold text-accent">
              {formatScore(result.score)}
            </p>
          </div>
          <span
            className="mt-1 size-2 rounded-full bg-accent"
            aria-label="Matched result"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-3 font-mono-app text-[10px] uppercase tracking-[.08em] text-muted-foreground">
        <span>
          EPIC{" "}
          <b className="text-foreground">{result.epicNumber || "Not listed"}</b>
        </span>
        <span>
          Part <b className="text-foreground">{result.partNumber}</b>
        </span>
        <span>
          Page <b className="text-foreground">{result.pageNumber}</b>
        </span>
        <span>
          Index confidence{" "}
          <b className="text-foreground">
            {Math.round(result.confidence * 100)}%
          </b>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText size={12} />
          <b className="max-w-[180px] truncate font-medium normal-case tracking-normal text-foreground">
            {result.pdfName}
          </b>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`${fileUrl}#page=${result.pageNumber}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          data-testid={`link-open-page-${result.id}`}
        >
          <ExternalLink size={13} /> Open on page {result.pageNumber}
        </a>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-secondary"
          data-testid={`link-open-pdf-${result.id}`}
        >
          Open PDF
        </a>
        <a
          href={fileUrl}
          download={result.pdfName}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground"
          data-testid={`link-download-pdf-${result.id}`}
        >
          <Download size={13} /> Download
        </a>
      </div>
    </article>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem("roll-desk-recent-searches") || "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const trimmed = query.trim();
  const searchParams = useMemo(
    () => ({ q: submitted || "__idle__", page, pageSize: PAGE_SIZE }),
    [submitted, page],
  );
  const suggestionParams = useMemo(() => ({ q: trimmed }), [trimmed]);
  const searchQuery = useSearchElectoralRoll(searchParams, {
    query: {
      enabled: Boolean(submitted),
      queryKey: getSearchElectoralRollQueryKey(searchParams),
    },
  });
  const suggestionsQuery = useGetSearchSuggestions(suggestionParams, {
    query: {
      enabled: trimmed.length >= 2 && trimmed !== submitted,
      queryKey: getGetSearchSuggestionsQueryKey(suggestionParams),
    },
  });
  const healthQuery = useHealthCheck();
  const response = searchQuery.data;
  const suggestions = suggestionsQuery.data || [];
  const totalPages = response
    ? Math.max(1, Math.ceil(response.total / response.pageSize))
    : 1;

  useEffect(() => {
    if (submitted) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, submitted]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    setPage(1);
    setSubmitted(trimmed);
    setRecentSearches((current) => {
      const next = [
        trimmed,
        ...current.filter(
          (item) => item.toLowerCase() !== trimmed.toLowerCase(),
        ),
      ].slice(0, 5);
      window.localStorage.setItem(
        "roll-desk-recent-searches",
        JSON.stringify(next),
      );
      return next;
    });
  }

  function clearSearch() {
    setQuery("");
    setSubmitted("");
    setPage(1);
  }

  return (
    <main>
      <section className="relative overflow-hidden border-b-4 border-accent bg-background">
        <div className="paper-grid absolute inset-0 opacity-35" />
        <div className="relative mx-auto max-w-[1240px] px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-12">
          <div className="grid grid-cols-2 items-end gap-5 sm:gap-8 lg:grid-cols-[220px_1fr_220px]">
            <div className="order-2 mx-auto w-full max-w-[220px] text-center lg:order-1">
              <div className="relative mx-auto aspect-[4/5] max-w-[190px] overflow-hidden rounded-t-[45%] border-4 border-accent bg-secondary shadow-[var(--shadow-md)]">
                <Image
                  src="/sushil.jpg"
                  alt="Sushilkumar Shinde"
                  fill
                  sizes="190px"
                  className="object-cover object-top"
                  priority
                />
              </div>
              <p className="mt-3 text-xl font-bold text-primary">
                मा. सुशीलकुमार शिंदे
              </p>
              <p className="mt-1 font-mono-app text-[10px] font-bold uppercase tracking-[.1em] text-accent">
                माजी केंद्रीय गृहमंत्री
              </p>
            </div>
            <div className="order-1 col-span-2 text-center lg:order-2 lg:col-span-1">
              <p className="font-mono-app text-[11px] font-bold uppercase tracking-[.16em] text-accent">
                ELECTORAL ROLL SEARCH
              </p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-[-.04em] text-primary sm:text-6xl">
                मतदार यादी शोध केंद्र
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-foreground sm:text-lg">
                उत्तर सोलापूरातील नागरिकांना
                <br />
                SIR नंतर मतदार यादीमध्ये नाव शोधण्यासाठी मदत
              </p>
              <div className="relative mx-auto mt-4 size-16 overflow-hidden rounded-full border-2 border-accent bg-background p-1">
                <Image
                  src="/Congress.png"
                  alt="Indian National Congress logo"
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
            </div>
            <div className="order-3 mx-auto w-full max-w-[220px] text-center">
              <div className="relative mx-auto aspect-[4/5] max-w-[190px] overflow-hidden rounded-t-[45%] border-4 border-primary bg-secondary shadow-[var(--shadow-md)]">
                <Image
                  src="/pranit.jpg"
                  alt="Praniti Shinde"
                  fill
                  sizes="190px"
                  className="object-cover object-top"
                  priority
                />
              </div>
              <p className="mt-3 font-mono-app text-[10px] font-bold uppercase tracking-[.12em] text-accent">
                मा. खासदार
              </p>
              <p className="mt-1 text-xl font-bold text-primary">
                प्रणितीताई शिंदे
              </p>
            </div>
          </div>
          <p className="mt-5 text-center text-lg font-medium text-foreground">
            यांच्या मार्गदर्शनाखाली
          </p>
          <form
            onSubmit={submitSearch}
            className="relative z-10 mx-auto mt-8 max-w-[920px] rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-md)] sm:p-8"
            data-testid="form-search"
          >
            <label htmlFor="roll-search" className="sr-only">
              Search voter records
            </label>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-primary">नाव शोधा</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                मतदाराचे नाव किंवा वडिलांचे / पतीचे नाव टाका आणि यादीत शोधा
              </p>
            </div>
            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 border-primary bg-background px-4 py-2 focus-within:border-accent">
                <Search className="shrink-0 text-accent" size={22} />
                <input
                  id="roll-search"
                  data-testid="input-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try a name or EPIC number"
                  className="min-w-0 flex-1 bg-transparent py-3 text-base font-medium outline-none placeholder:text-muted-foreground/65"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    data-testid="button-clear-search"
                    onClick={clearSearch}
                    className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                data-testid="button-submit-search"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 text-base font-bold text-accent-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!trimmed}
              >
                शोधा <Search size={18} />
              </button>
            </div>
            {suggestions.length > 0 && !submitted && (
              <div
                className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-md)]"
                data-testid="list-suggestions"
              >
                <p className="px-3 py-2 font-mono-app text-[9px] uppercase tracking-[.14em] text-muted-foreground">
                  Suggested records
                </p>
                {suggestions.slice(0, 5).map((suggestion) => (
                  <button
                    type="button"
                    key={`${suggestion.kind}-${suggestion.value}`}
                    data-testid={`button-suggestion-${suggestion.value}`}
                    onClick={() => {
                      setQuery(suggestion.value);
                      setSubmitted(suggestion.value);
                      setPage(1);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-secondary"
                  >
                    <span>{suggestion.label}</span>
                    <span className="font-mono-app text-[9px] uppercase text-muted-foreground">
                      {suggestion.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-700">
              <BookOpen size={16} /> शोध पूर्णपणे मोफत आहे
            </div>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={13} /> मोफत सेवा
            </span>
            <span className="hidden size-1 rounded-full bg-border sm:block" />
            <span
              data-testid="status-search-health"
              className="inline-flex items-center gap-1.5"
            >
              {healthQuery.isError ? (
                <AlertCircle size={13} className="text-destructive" />
              ) : (
                <span
                  className={`size-1.5 rounded-full ${healthQuery.isLoading ? "animate-pulse bg-accent" : "bg-emerald-700"}`}
                />
              )}{" "}
              Index{" "}
              {healthQuery.isError
                ? "unavailable"
                : healthQuery.isLoading
                  ? "checking"
                  : "online"}
            </span>
          </div>
        </div>
      </section>

      {!submitted && (
        <>
          <section className="mx-auto grid max-w-[1240px] grid-cols-2 divide-x divide-border rounded-2xl border border-border bg-card px-2 py-5 shadow-[var(--shadow-sm)] sm:grid-cols-4 sm:px-4">
            {[
              {
                icon: Users,
                value: "38",
                label: "गावे",
                detail: "उत्तर सोलापूरातील",
              },
              {
                icon: FileText,
                value: "9",
                label: "भाग",
                detail: "मतदार यादी भाग",
              },
              {
                icon: Users,
                value: "10,987+",
                label: "एकूण मतदार",
                detail: "नोंदणीकृत मतदार",
              },
              {
                icon: CheckCircle2,
                value: "100%",
                label: "अद्ययावत",
                detail: "SIR नंतरची यादी",
              },
            ].map(({ icon: Icon, value, label, detail }) => (
              <div
                key={label}
                className="flex flex-col items-center px-3 py-3 text-center"
              >
                <Icon size={27} className="text-emerald-600" />
                <p className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
                  {value} <span className="text-base font-medium">{label}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </section>
          <section className="mx-auto mt-5 max-w-[1240px] rounded-2xl border border-border bg-card px-5 py-5 shadow-[var(--shadow-sm)] sm:px-8">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="flex items-center gap-2 text-xl font-bold text-emerald-700">
                <MapPin size={22} /> समाविष्ट गावे (38)
              </h2>
              <span className="text-sm font-semibold text-emerald-700">
                संपूर्ण यादी पहा{" "}
                <ArrowRight className="ml-1 inline" size={16} />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["Akolekati", "अकोलेकाटी"],
                ["Banegaon", "बाणेगाव"],
                ["Belati", "बेलाटी"],
                ["Bhagaiwadi", "भगाईवाडी"],
                ["Bhatewadi", "भाटेवाडी"],
                ["Bhogaon", "भोगाव"],
                ["Darfal (Bibi)", "दरफळ बिबी"],
                ["Darphal (Gawadi)", "दरफळ गावडी"],
                ["Dongaon", "डोंगाव"],
                ["Ekrukh", "एकरुख"],
                ["Gulwanchi", "गुळवंची"],
                ["Haglur", "हागळूर"],
                ["Hipparge", "हिप्परगे"],
                ["Hiraj", "हिरज"],
                ["Honsal", "होंसळ"],
                ["Kalman", "कळमण"],
                ["Karamba", "करंबा"],
                ["Kavathe", "कवठे"],
                ["Khed", "खेड"],
                ["Kondi", "कोंडी"],
                ["Kouthali", "कौठाळी"],
                ["Mardi", "मार्डी"],
                ["Mohitewadi", "मोहितेवाडी"],
                ["Nandur", "नांदूर"],
                ["Nannaj", "नान्नज"],
                ["Narotewadi", "नरोटेवाडी"],
                ["Padsali", "पडसाळी"],
                ["Pakani", "पाकणी"],
                ["Pathari", "पाथरी"],
                ["Raleras", "राळेरस"],
                ["Ranmasle", "रणमसळे"],
                ["Sakharewadi", "साखरेवाडी"],
                ["Samshapur", "शमशापूर"],
                ["Sevalalnagar", "सेवालालनगर"],
                ["Shivani", "शिवणी"],
                ["Taratgaon", "तरटगाव"],
                ["Telgaon", "तेलगाव"],
                ["Tirhe", "तिर्हे"],
                ["Wadala", "वडाळा"],
                ["Wangi", "वांगी"],
              ].map(([english, marathi]) => (
                <span
                  key={english}
                  className="rounded-full border border-emerald-700/35 px-4 py-2 text-sm text-foreground"
                >
                  {english}{" "}
                  <span className="text-muted-foreground">({marathi})</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-14">
        {!submitted ? (
          <div className="grid gap-8 border-b border-border pb-12 md:grid-cols-[1fr_280px]">
            <div>
              <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em] text-accent">
                शोध कसा घ्यावा
              </p>
              <h2 className="mt-3 max-w-lg text-3xl font-bold leading-tight tracking-[-.04em] text-primary">
                एका ठिकाणी संपूर्ण मतदार यादी.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                उपलब्ध असलेल्या स्पेलिंगपासून सुरुवात करा. अपूर्ण नाव किंवा EPIC
                क्रमांक टाकला तरी शोध परिणाम मिळतील.
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-secondary/50 p-5">
                <Sparkles size={18} className="text-accent" />
                <p className="mt-4 text-sm font-bold text-foreground">
                  शोधासाठी उपयुक्त माहिती
                </p>
                <ul className="mt-3 space-y-2 font-mono-app text-[10px] uppercase tracking-[.08em] text-muted-foreground">
                  <li>पूर्ण नाव किंवा आडनाव</li>
                  <li>वडिलांचे / पतीचे नाव</li>
                  <li>EPIC क्रमांकाचा भाग</li>
                </ul>
              </div>
              {recentSearches.length > 0 && (
                <div
                  className="rounded-xl border border-border bg-card p-5"
                  data-testid="section-recent-searches"
                >
                  <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.14em] text-accent">
                    Recent searches
                  </p>
                  <div className="mt-3 space-y-1">
                    {recentSearches.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setQuery(item);
                          setSubmitted(item);
                          setPage(1);
                        }}
                        className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em] text-accent">
                  Search results
                </p>
                <h2
                  data-testid="text-results-heading"
                  className="mt-2 text-2xl font-bold tracking-[-.04em] text-primary sm:text-3xl"
                >
                  {searchQuery.isLoading
                    ? "Looking through the rolls…"
                    : response
                      ? `${formatCount(response.total)} records found`
                      : "Unable to load records"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Showing matches for{" "}
                  <span className="font-semibold text-foreground">
                    “{submitted}”
                  </span>
                  {response?.indexStatus === "indexing" ? (
                    <span className="ml-2 text-accent">
                      · live index {response.indexProgress}% complete
                    </span>
                  ) : null}
                </p>
              </div>
              {response && response.total > 0 && (
                <div className="font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                  Page {response.page} of {totalPages}
                </div>
              )}
            </div>
            {searchQuery.isLoading && <SkeletonRows />}
            {searchQuery.isError && (
              <div
                className="rounded-xl border border-destructive/25 bg-destructive/5 p-8 text-center"
                data-testid="error-search"
              >
                <AlertCircle className="mx-auto text-destructive" size={24} />
                <h3 className="mt-3 font-bold">The index didn’t answer</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try again in a moment or search with a shorter name.
                </p>
                <button
                  type="button"
                  data-testid="button-retry-search"
                  onClick={() => searchQuery.refetch()}
                  className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  Retry search
                </button>
              </div>
            )}
            {!searchQuery.isLoading &&
              !searchQuery.isError &&
              response?.results.length === 0 && (
                <div
                  className="rounded-xl border border-border bg-card p-10 text-center"
                  data-testid="empty-search"
                >
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Search size={20} />
                  </div>
                  <h3 className="mt-4 font-bold text-primary">
                    No record found for that search
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                    Check the spelling, try a surname only, or use the first few
                    characters of an EPIC number.
                  </p>
                </div>
              )}
            {!searchQuery.isLoading &&
            !searchQuery.isError &&
            response?.results.length ? (
              <div className="space-y-3">
                {response.results.map((result) => (
                  <ResultCard key={result.id} result={result} />
                ))}
              </div>
            ) : null}
            {response && response.total > PAGE_SIZE && (
              <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
                <button
                  type="button"
                  data-testid="button-previous-page"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-35"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="font-mono-app text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  data-testid="button-next-page"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-35"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {!submitted && (
        <section className="border-t-4 border-accent bg-card">
          <div className="mx-auto grid max-w-[1240px] items-center gap-6 px-5 py-8 sm:grid-cols-[180px_1fr_1fr] sm:px-8">
            <div className="relative mx-auto aspect-square w-36 overflow-hidden rounded-full border-4 border-accent bg-secondary">
              <Image
                src="/bharat.jpg"
                alt="Bharat Jadhav"
                fill
                sizes="144px"
                className="object-cover object-top"
              />
            </div>
            <div className="text-center sm:border-r sm:border-border sm:pr-8 sm:text-left">
              <p className="text-3xl font-bold text-primary">भारत जाधव</p>
              <p className="mt-1 text-lg font-semibold text-accent">अध्यक्ष</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">
                उत्तर सोलापूर काँग्रेस
              </p>
            </div>
            <div className="text-center text-lg leading-8 text-foreground sm:text-left">
              उत्तर सोलापूरातील नागरिकांच्या सेवेसाठी
              <br />
              <strong className="text-2xl text-emerald-700">
                आम्ही सदैव आपल्या सोबत!
              </strong>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
