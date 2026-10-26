import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { localizedCategory, translate, type Language } from "./i18n";
import { createSpeechRecognizer, type SpeechRecognizer } from "./speech";
import {
  ArrowRight,
  Bot,
  Check,
  CircleHelp,
  Heart,
  Mic,
  MicOff,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Send,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";

type CivicIssue = {
  category: string;
  department: string;
  nextStep: string;
};

type Priority = "high" | "medium" | "low";

type IssueComment = {
  id: string;
  text: string;
  role?: string;
};

type Issue = {
  id: string;
  title: string;
  description: string;
  category: string;
  area: string;
  priority: Priority;
  likes: number;
  likedByMe: boolean;
  comments: IssueComment[];
  status?: string;
  country?: string;
  state?: string;
  district?: string;
  locality?: string;
  location?: { latitude: number; longitude: number; altitude?: number };
  photoUrl?: string;
  scope?: string;
  apiBacked?: boolean;
  isSample?: boolean;
  createdAt: string | number;
};

type CivicIdea = {
  id: string;
  category: string;
  title: string;
  description: string;
  votes: number;
  comments?: IssueComment[];
  isSample?: boolean;
};

type CivicStats = {
  totalTickets: number;
  openTickets: number;
  categories: { category: string; count: number }[];
  places: { place: string; count: number }[];
  statuses: Record<string, number>;
};

const initialIssues: Issue[] = [
  {
    id: "DEMO-ROAD",
    category: "Roads",
    title: "Potholes near a bus stop",
    description: "Several potholes make it difficult for buses and pedestrians to pass safely.",
    area: "Pune, Maharashtra · example",
    priority: "high",
    likes: 42,
    likedByMe: false,
    comments: [{ id: "road-comment", text: "A clear landmark could help the local authority identify the stretch.", role: "Example comment" }],
    isSample: true,
    status: "Example",
    country: "India",
    state: "Maharashtra",
    district: "Pune",
    scope: "district",
    createdAt: 3,
  },
  {
    id: "DEMO-WATER",
    category: "Water",
    title: "Intermittent water supply",
    description: "Residents would benefit from a published schedule and clearer service updates.",
    area: "Bengaluru, Karnataka · example",
    priority: "medium",
    likes: 31,
    likedByMe: false,
    comments: [
      { id: "water-comment-1", text: "A schedule would make planning much easier.", role: "Example comment" },
      { id: "water-comment-2", text: "Please include updates when maintenance changes the timing.", role: "Example comment" },
    ],
    isSample: true,
    status: "Example",
    country: "India",
    state: "Karnataka",
    district: "Bengaluru Urban",
    scope: "district",
    createdAt: 2,
  },
  {
    id: "DEMO-WASTE",
    category: "Waste",
    title: "Missed waste collection",
    description: "A more reliable collection schedule could help reduce overflowing public bins.",
    area: "Jaipur, Rajasthan · example",
    priority: "low",
    likes: 18,
    likedByMe: false,
    comments: [],
    isSample: true,
    status: "Example",
    country: "India",
    state: "Rajasthan",
    district: "Jaipur",
    scope: "district",
    createdAt: 1,
  },
];

const issueCategories = ["Roads", "Water", "Waste", "Public transport", "Health", "Education", "Budget & funding", "Safety", "Environment", "Other"];
const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
function localizePriority(language: Language, priority: Priority) {
  const key = priority === "high" ? "priorityHigh" : priority === "medium" ? "priorityMedium" : "priorityLow";
  return translate(language, key);
}

function suggestIssueCategory(text: string): string | null {
  const rules: [string, RegExp][] = [
    ["Education", /\b(education|school|teacher|classroom|scholarship|school budget)\b|शिक्षा|विद्यालय|স্কুল|শিক্ষা|கல்வி|பள்ளி|విద్య|పాఠశాల/i],
    ["Roads", /\b(road|pothole|streetlight|footpath|sidewalk|pavement)\b|सड़क|गड्ढा|রাস্তা|গর্ত|சாலை|குழி|రోడ్డు|గుంత/i],
    ["Water", /\b(water|tap|drain|sewer|leak|flood|drinking water)\b|पानी|जल|नल|জল|পানি|কল|நீர்|குழாய்|தண்ணீர்|నీరు|కుళాయి/i],
    ["Waste", /\b(waste|garbage|rubbish|litter|sanitation|dump|collection)\b|कचरा|कूड़ा|குப்பை|వ్యర్థ|చెత్త|বর্জ্য|আবর্জনা/i],
    ["Public transport", /\b(bus|train|transit|public transport|bus stop)\b|बस|परिवहन|பேருந்து|போக்குவரத்து|బస్సు|రవాణా|বাস|পরিবহন/i],
    ["Health", /\b(health|hospital|clinic|medicine|medical|primary care)\b|स्वास्थ्य|अस्पताल|চিকিৎসা|হাসপাতাল|சுகாதாரம்|மருத்துவமனை|ఆరోగ్యం|ఆసుపత్రి/i],
    ["Environment", /\b(environment|pollution|air quality|tree|forest|emission)\b|प्रदूषण|पर्यावरण|দূষণ|পরিবেশ|மாசு|சுற்றுச்சூழல்|కాలుష్యం|పర్యావరణం/i],
    ["Safety", /\b(safety|unsafe|hazard|street crime|public safety)\b|सुरक्षा|खतरा|নিরাপত্তা|ঝুঁকি|பாதுகாப்பு|ஆபத்து|భద్రత|ప్రమాదం/i],
    ["Budget & funding", /\b(budget|funding|funds|grant|finance|allocation)\b|बजट|वित्त|निधि|বাজেট|অর্থায়ন|நிதி|பட்ஜெட்|నిధులు|బడ్జెట్/i],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function suggestOffice(category: string, scope: string, country: string, state: string, district: string, description: string) {
  if (scope === "global") return "No single government assignee; identify the affected country and jurisdiction first.";
  if (country.toLowerCase() !== "india") return `Relevant ${scope}-level ${category.toLowerCase()} service department; verify through the official government directory.`;

  const educationRequest = category === "Education" || /education|schools?|teacher|शिक्षा|विद्यालय|স্কুল|শিক্ষা|கல்வி|பள்ளி|విద్య|పాఠశాల/i.test(description);
  const budgetRequest = category === "Budget & funding" || (
    educationRequest && /\b(fund|funding|budget|grant|finance|cost)\b|बजट|वित्त|निधि|অর্থায়ন|বাজেট|நிதி|பட்ஜெட்|నిధి|నిధులు|బడ్జెట్/i.test(description)
  );
  if (budgetRequest) {
    const educationOffice = educationRequest ? "School Education Department" : "relevant line department";
    if (scope === "locality") return `Local-body budget office + local ${educationRequest ? "education office" : "service department"}`;
    if (scope === "district") return `${district || "District"} planning/finance office + ${educationRequest ? `${district || "District"} District Education Office` : educationOffice}`;
    if (scope === "state") return `${state || "State/UT"} Finance Department + ${state || "State/UT"} ${educationOffice}`;
    return `Union Ministry of Finance + ${educationRequest ? "Ministry of Education" : "relevant ministry"}`;
  }

  const offices: Record<string, Record<string, string>> = {
    Roads: {
      locality: "Municipal engineering office, Panchayat Works, or the road owner",
      district: "District Public Works Department or the district road owner",
      state: `${state || "State/UT"} Public Works Department or roads agency`,
      country: "Ministry of Road Transport and Highways (national highways only)",
    },
    Water: {
      locality: "Local water utility, municipality, or Gram Panchayat water service",
      district: "District water supply / public health engineering department",
      state: `${state || "State/UT"} water resources or public health engineering department`,
      country: "Relevant Union water resources ministry or national water authority",
    },
    Waste: {
      locality: "Municipality or Gram Panchayat sanitation service",
      district: "District urban or rural local-government department",
      state: `${state || "State/UT"} Urban Development or Rural Development Department`,
      country: "Relevant Union ministry for urban development or rural development",
    },
    "Public transport": {
      locality: "City transit operator or local transport authority",
      district: "District transport office or transit operator",
      state: `${state || "State/UT"} Transport Department`,
      country: "Ministry of Road Transport and Highways (national-level matters)",
    },
    Health: {
      locality: "Primary Health Centre or local public-health office",
      district: "District Health Department",
      state: `${state || "State/UT"} Health Department`,
      country: "Ministry of Health and Family Welfare",
    },
    Education: {
      locality: "Block Education Office or school administration",
      district: "District Education Office",
      state: `${state || "State/UT"} School Education Department`,
      country: "Ministry of Education",
    },
    Safety: {
      locality: "Official local non-emergency public-safety channel",
      district: "District public-safety department",
      state: `${state || "State/UT"} Home or Public Safety Department`,
      country: "Relevant Union ministry for the specific public-safety service",
    },
    Environment: {
      locality: "Local environmental-health or sanitation service",
      district: "District Environment Department",
      state: `State Pollution Control Board or ${state || "State/UT"} Environment Department`,
      country: "Ministry of Environment, Forest and Climate Change",
    },
    Other: {
      locality: "Local service provider or local body",
      district: `${district || "District"} department responsible for the service`,
      state: `${state || "State/UT"} department responsible for the service`,
      country: "Union ministry responsible for the service",
    },
  };
  return offices[category]?.[scope] ?? "Relevant public-service department for the selected jurisdiction";
}

const sampleProposals: CivicIdea[] = [
  {
    id: "public-toilets",
    category: "PUBLIC HEALTH",
    title: "Publish maintenance schedules for public toilets",
    description: "Make cleaning frequency, inspection dates, and a simple feedback channel visible at each facility.",
    votes: 248,
  },
  {
    id: "bus-access",
    category: "TRANSPORT",
    title: "Make bus-stop accessibility easier to report",
    description: "Offer a clear way to flag broken ramps, missing signs, or unsafe crossings near transit stops.",
    votes: 173,
  },
];

async function civicRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "The civic service request failed.");
  return payload as T;
}

async function prepareIssuePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 12_000_000) {
    throw new Error("Choose an image smaller than 12 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("This photo could not be optimized.")),
      "image/jpeg",
      0.78,
    ));
    if (blob.size > 1_000_000) throw new Error("The optimized photo is still too large. Choose a smaller image.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("This photo could not be read."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("This photo could not be read."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

function toIssue(ticket: Omit<Issue, "likes" | "likedByMe" | "apiBacked"> & { likes?: number }): Issue {
  return {
    ...ticket,
    area: [ticket.locality, ticket.district, ticket.state, ticket.country].filter(Boolean).join(", "),
    likes: ticket.likes ?? 0,
    likedByMe: false,
    comments: ticket.comments ?? [],
    apiBacked: true,
  };
}

function suggestNextStep(description: string): CivicIssue {
  const text = description.toLowerCase();

  if (/(water|tap|leak|drain|sewer|flood)/.test(text)) {
    return {
      category: "Water and drainage",
      department: "Your local municipality or water utility",
      nextStep: "Check the official local water or municipal grievance channel and include the nearest public landmark.",
    };
  }
  if (/(road|pothole|street|footpath|pavement|traffic)/.test(text)) {
    return {
      category: "Roads and transport",
      department: "Your municipality or the road-owning authority",
      nextStep: "Check your local authority's official reporting channel. Road responsibility can vary by location.",
    };
  }
  if (/(garbage|waste|rubbish|litter|collection|dump)/.test(text)) {
    return {
      category: "Waste and sanitation",
      department: "Your local municipal sanitation service",
      nextStep: "Look for the official municipal sanitation channel and report a nearby public landmark, not a home address.",
    };
  }
  return {
    category: "General public service",
    department: "The authority responsible for the service in your area",
    nextStep: "Identify the service provider or local authority first, then use its published official grievance channel.",
  };
}

function CivicPilot({ language }: { language: Language }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const [description, setDescription] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [guidance, setGuidance] = useState<CivicIssue | null>(null);
  const [votedProposalIds, setVotedProposalIds] = useState<string[]>([]);
  const [issues, setIssues] = useState(initialIssues);
  const [ideas, setIdeas] = useState(sampleProposals);
  const [stats, setStats] = useState<CivicStats>({ totalTickets: 0, openTickets: 0, categories: [], places: [], statuses: {} });
  const [apiState, setApiState] = useState<"loading" | "online" | "offline">("loading");
  const [activeBrowsers, setActiveBrowsers] = useState<number | null>(null);
  const [presenceState, setPresenceState] = useState<"loading" | "online" | "offline">("loading");
  const [civicError, setCivicError] = useState("");
  const [createdTicketId, setCreatedTicketId] = useState("");
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [countries, setCountries] = useState<string[]>(["India"]);
  const [states, setStates] = useState<string[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [districts, setDistricts] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [pincode, setPincode] = useState("");
  const [pincodeOffices, setPincodeOffices] = useState<{ locality: string; district: string; state: string; pincode: string }[]>([]);
  const [selectedPincodeOffice, setSelectedPincodeOffice] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");
  const pincodeRequestId = useRef(0);
  const [issueLocation, setIssueLocation] = useState<{ latitude: number; longitude: number; altitude?: number } | null>(null);
  const [shareExactLocation, setShareExactLocation] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState("");
  const [latitudeDraft, setLatitudeDraft] = useState("");
  const [longitudeDraft, setLongitudeDraft] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [listeningField, setListeningField] = useState<"issue" | "guide" | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voiceErrorField, setVoiceErrorField] = useState<"issue" | "guide" | null>(null);
  const speechRecognizer = useRef<SpeechRecognizer | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueCategory, setIssueCategory] = useState("Roads");
  const [country, setCountry] = useState("India");
  const [stateOrProvince, setStateOrProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [locality, setLocality] = useState("");
  const [scope, setScope] = useState("locality");
  const [issuePriority, setIssuePriority] = useState<Priority>("medium");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [issueSort, setIssueSort] = useState<"priority" | "likes" | "discussion">("priority");
  const [filters, setFilters] = useState({ country: "", state: "", district: "", locality: "", category: "" });
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [ideaCategory, setIdeaCategory] = useState("Education");
  const [ideaCountry, setIdeaCountry] = useState("India");
  const [ideaCommentDrafts, setIdeaCommentDrafts] = useState<Record<string, string>>({});
  const [commentRole, setCommentRole] = useState("Community member");
  const [voterId] = useState(() => {
    const storageKey = "bharat-demo-voter-id";
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      const created = crypto.randomUUID();
      window.localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  });

  const rankedIssues = [...issues].sort((first, second) =>
    (issueSort === "priority" ? priorityOrder[first.priority] - priorityOrder[second.priority] : 0)
      || (issueSort === "likes" ? second.likes - first.likes : 0)
      || (issueSort === "discussion" ? second.comments.length - first.comments.length : 0)
      || (issueSort === "priority" ? (second.likes + second.comments.length * 2) - (first.likes + first.comments.length * 2) : 0)
      || (new Date(second.createdAt).getTime() || Number(second.createdAt)) - (new Date(first.createdAt).getTime() || Number(first.createdAt)),
  );

  const visibleIssues = useMemo(() => rankedIssues.filter((issue) =>
    (!filters.country || issue.country === filters.country)
      && (!filters.state || issue.state === filters.state)
      && (!filters.district || issue.district?.toLowerCase().includes(filters.district.toLowerCase()))
      && (!filters.locality || issue.locality?.toLowerCase().includes(filters.locality.toLowerCase()))
      && (!filters.category || issue.category === filters.category),
  ), [filters, rankedIssues]);
  const availableCountries = [...new Set([...countries, ...issues.map((issue) => issue.country).filter((value): value is string => Boolean(value))])];
  const availableStates = [...new Set([...states, ...issues.map((issue) => issue.state).filter((value): value is string => Boolean(value))])];
  const categorySuggestion = suggestIssueCategory(`${issueTitle}\n${issueDescription}`);
  const suggestedRecipient = suggestOffice(issueCategory, scope, country, stateOrProvince, district, `${issueTitle}\n${issueDescription}`);

  useEffect(() => () => {
    const recognizer = speechRecognizer.current;
    if (recognizer) {
      recognizer.onend = null;
      recognizer.onerror = null;
      recognizer.stop();
    }
  }, []);

  function toggleVoiceEntry(field: "issue" | "guide") {
    setVoiceError("");
    setVoiceErrorField(field);
    if (listeningField === field) {
      speechRecognizer.current?.stop();
      return;
    }
    if (speechRecognizer.current) {
      speechRecognizer.current.onend = null;
      speechRecognizer.current.onerror = null;
      speechRecognizer.current.stop();
      speechRecognizer.current = null;
    }
    const recognizer = createSpeechRecognizer();
    if (!recognizer) {
      setVoiceError(t("voiceUnsupported"));
      return;
    }
    recognizer.lang = language === "en" ? "en-IN" : `${language}-IN`;
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const transcript = Array.from(event.results).slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript.trim())
        .filter(Boolean)
        .join(" ");
      if (!transcript) return;
      const limit = field === "issue" ? 280 : 500;
      const currentText = field === "issue" ? issueDescription : description;
      if (`${currentText.trim()} ${transcript}`.trim().length > limit) {
        setVoiceError(t("voiceTruncated"));
        setVoiceErrorField(field);
      }
      if (field === "issue") setIssueDescription((current) => `${current.trim()} ${transcript}`.trim().slice(0, limit));
      else setDescription((current) => `${current.trim()} ${transcript}`.trim().slice(0, limit));
    };
    recognizer.onerror = (event) => {
      setVoiceError(`${t("voiceError")} (${event.error})`);
      setVoiceErrorField(field);
      setListeningField(null);
      speechRecognizer.current = null;
    };
    recognizer.onend = () => {
      setListeningField((current) => current === field ? null : current);
      speechRecognizer.current = null;
    };
    speechRecognizer.current = recognizer;
    setListeningField(field);
    try {
      recognizer.start();
    } catch {
      setListeningField(null);
      speechRecognizer.current = null;
      setVoiceError(t("voiceError"));
      setVoiceErrorField(field);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadCivicData() {
      try {
        const [issueData, statsData, ideaData] = await Promise.all([
          civicRequest<{ issues: (Omit<Issue, "likes" | "likedByMe" | "apiBacked"> & { likes?: number })[] }>("/api/civic/issues"),
          civicRequest<CivicStats>("/api/civic/stats"),
          civicRequest<{ ideas: CivicIdea[] }>("/api/civic/ideas"),
        ]);
        if (!active) return;
        let savedVotedIdeas: string[] = [];
        try {
          const stored = JSON.parse(window.localStorage.getItem("bharat-demo-voted-ideas") ?? "[]");
          if (Array.isArray(stored)) savedVotedIdeas = stored.filter((id): id is string => typeof id === "string");
        } catch {
          setCivicError("Saved demo-vote preferences could not be read; you can still explore the civic board.");
        }
        setIssues([...issueData.issues.map(toIssue), ...initialIssues]);
        setStats(statsData);
        setIdeas([...ideaData.ideas.map((idea: CivicIdea & { voterIds?: string[] }) => ({
          ...idea,
          likedByMe: savedVotedIdeas.includes(idea.id),
          apiBacked: true,
        })), ...sampleProposals]);
        setVotedProposalIds(savedVotedIdeas);
        setApiState("online");
      } catch (error) {
        if (!active) return;
        setApiState("offline");
        setCivicError(error instanceof Error ? error.message : "Could not reach the local civic service.");
      }
    }
    void loadCivicData();
    return () => { active = false; };
  }, [voterId]);

  useEffect(() => {
    let active = true;
    async function sendPresenceHeartbeat() {
      try {
        const { activeNow } = await civicRequest<{ activeNow: number }>("/api/civic/presence", { method: "POST" });
        if (active) {
          setActiveBrowsers(activeNow);
          setPresenceState("online");
        }
      } catch {
        if (active) {
          setActiveBrowsers(null);
          setPresenceState("offline");
        }
      }
    }

    void sendPresenceHeartbeat();
    const heartbeatTimer = window.setInterval(() => void sendPresenceHeartbeat(), 30_000);
    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void civicRequest<{ countries: string[] }>("/api/civic/locations/countries")
      .then(({ countries: available }) => { if (active) setCountries(available); })
      .catch((error: unknown) => {
        if (!active) return;
        setLocationError(error instanceof Error ? error.message : "Location suggestions are unavailable. You can enter a place manually.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setStates([]);
    if (!country.trim() || scope === "country" || !countries.some((item) => item.toLowerCase() === country.trim().toLowerCase())) {
      setStatesLoading(false);
      return () => { active = false; };
    }
    setStatesLoading(true);
    setLocationError("");
    void civicRequest<{ states: string[] }>(`/api/civic/locations/states?country=${encodeURIComponent(country)}`)
      .then(({ states: available }) => { if (active) setStates(available); })
      .catch((error: unknown) => {
        if (active) setLocationError(error instanceof Error ? error.message : "State suggestions are unavailable. You can enter a state manually.");
      })
      .finally(() => { if (active) setStatesLoading(false); });
    return () => { active = false; };
  }, [countries, country, scope]);

  useEffect(() => {
    let active = true;
    setDistricts([]);
    if (!stateOrProvince.trim() || !states.some((item) => item.toLowerCase() === stateOrProvince.trim().toLowerCase()) || !["district", "locality"].includes(scope)) {
      setDistrictsLoading(false);
      return () => { active = false; };
    }
    setDistrictsLoading(true);
    setLocationError("");
    void civicRequest<{ districts: string[] }>(`/api/civic/locations/districts?state=${encodeURIComponent(stateOrProvince)}`)
      .then(({ districts: available }) => { if (active) setDistricts(available); })
      .catch((error: unknown) => {
        if (active) setLocationError(error instanceof Error ? error.message : "District suggestions are unavailable. You can enter a district manually.");
      })
      .finally(() => { if (active) setDistrictsLoading(false); });
    return () => { active = false; };
  }, [scope, stateOrProvince, states]);

  useEffect(() => {
    let active = true;
    setPlaces([]);
    if (!country.trim() || !stateOrProvince.trim() || !states.some((item) => item.toLowerCase() === stateOrProvince.trim().toLowerCase()) || scope !== "locality") {
      setLocationsLoading(false);
      return () => { active = false; };
    }
    setLocationsLoading(true);
    setLocationError("");
    const query = new URLSearchParams({ country, state: stateOrProvince });
    void civicRequest<{ places: string[] }>(`/api/civic/locations/places?${query}`)
      .then(({ places: available }) => { if (active) setPlaces(available); })
      .catch((error: unknown) => {
        if (active) setLocationError(error instanceof Error ? error.message : "Place suggestions are unavailable. You can enter a place manually.");
      })
      .finally(() => { if (active) setLocationsLoading(false); });
    return () => { active = false; };
  }, [country, scope, stateOrProvince, states]);

  useEffect(() => {
    if (pincode.length !== 6) return;
    const timer = window.setTimeout(() => void lookupPincode(), 250);
    return () => window.clearTimeout(timer);
  }, [pincode]);

  function handleGuidance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = description.trim();
    setSubmittedQuestion(question);
    setGuidance(suggestNextStep(question));
  }

  async function addIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = issueTitle.trim();
    const description = issueDescription.trim();
    if (!title || !description || !country.trim()) {
      setCivicError(t("ticketRequiredFields"));
      return;
    }

    setCivicError("");
    setCreatedTicketId("");
    setIsCreatingTicket(true);
    try {
      const { ticket } = await civicRequest<{ ticket: Omit<Issue, "likes" | "likedByMe" | "apiBacked"> & { likes?: number } }>("/api/civic/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category: issueCategory,
          priority: issuePriority,
          country,
          state: scope === "state" || scope === "district" || scope === "locality" ? stateOrProvince.trim() : "",
          district: scope === "district" || scope === "locality" ? district.trim() : "",
          locality: scope === "locality" ? locality.trim() : "",
          scope,
          location: issueLocation ? {
            latitude: shareExactLocation ? issueLocation.latitude : Number(issueLocation.latitude.toFixed(3)),
            longitude: shareExactLocation ? issueLocation.longitude : Number(issueLocation.longitude.toFixed(3)),
            ...(shareExactLocation && issueLocation.altitude !== undefined ? { altitude: issueLocation.altitude } : {}),
          } : undefined,
          photoDataUrl: photoDataUrl || undefined,
        }),
      });
      setIssues((current) => [toIssue(ticket), ...current]);
      setStats(await civicRequest<CivicStats>("/api/civic/stats"));
      setCreatedTicketId(ticket.id);
      setIssueTitle("");
      setIssueDescription("");
      setStateOrProvince("");
      setDistrict("");
      setLocality("");
      setPincode("");
      setPincodeOffices([]);
      setSelectedPincodeOffice("");
      setIssueLocation(null);
      setLatitudeDraft("");
      setLongitudeDraft("");
      setShareExactLocation(false);
      setPhotoDataUrl("");
      setPhotoError("");
      setPhotoPreparing(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setIssuePriority("medium");
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not create the ticket.");
    } finally {
      setIsCreatingTicket(false);
    }
  }

  async function lookupPincode() {
      if (!/^\d{6}$/.test(pincode.trim())) {
        setPincodeError(t("invalidPincode"));
        return;
      }
      const requestId = ++pincodeRequestId.current;
      setPincodeLoading(true);
      setPincodeError("");
      try {
        const { offices } = await civicRequest<{ offices: { locality: string; district: string; state: string; pincode: string }[] }>(
          `/api/civic/locations/pincode?pincode=${encodeURIComponent(pincode.trim())}`,
        );
        if (requestId !== pincodeRequestId.current) return;
        if (!offices.length) throw new Error(t("pincodeUnavailable"));
        setPincodeOffices(offices);
        setSelectedPincodeOffice(offices[0]?.locality ?? "");
        applyPincodeOffice(offices[0]);
      } catch (error) {
        if (requestId !== pincodeRequestId.current) return;
        setPincodeOffices([]);
        setPincodeError(error instanceof Error ? error.message : t("pincodeUnavailable"));
      } finally {
        if (requestId === pincodeRequestId.current) setPincodeLoading(false);
      }
    }

  function applyPincodeOffice(office: { locality: string; district: string; state: string; pincode: string }) {
      const matchingState = states.find((item) => item.toLowerCase() === office.state.toLowerCase());
      setSelectedPincodeOffice(office.locality);
      setStateOrProvince(matchingState ?? office.state);
      setDistrict(office.district);
      setLocality(office.locality);
      setPincode(office.pincode);
      setPincodeError(matchingState ? "" : t("pincodeDirectoryMismatch"));
    }

  function useCurrentLocation() {
      setLocationPermissionError("");
      if (!navigator.geolocation) {
        setLocationPermissionError(t("locationUnsupported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (coords.latitude < 6 || coords.latitude > 38 || coords.longitude < 68 || coords.longitude > 98) {
            setLocationPermissionError(t("outsideIndiaLocation"));
            return;
          }
          setIssueLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            ...(coords.altitude === null ? {} : { altitude: coords.altitude }),
          });
          setLatitudeDraft(String(coords.latitude));
          setLongitudeDraft(String(coords.longitude));
        },
        () => setLocationPermissionError(t("locationUnavailable")),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    }

    function updateManualCoordinates(latitude: string, longitude: string) {
      setLatitudeDraft(latitude);
      setLongitudeDraft(longitude);
      setLocationPermissionError("");
      if (!latitude.trim() || !longitude.trim()) {
        setIssueLocation(null);
        return;
      }
      const parsedLatitude = Number(latitude);
      const parsedLongitude = Number(longitude);
      if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)
        || parsedLatitude < 6 || parsedLatitude > 38 || parsedLongitude < 68 || parsedLongitude > 98) {
        setIssueLocation(null);
        setLocationPermissionError(t("invalidMapCoordinates"));
        return;
      }
      setIssueLocation({ latitude: parsedLatitude, longitude: parsedLongitude });
    }

  async function handlePhotoSelection(file: File | undefined) {
      setPhotoError("");
      if (!file) {
        setPhotoDataUrl("");
        return;
      }
      setPhotoPreparing(true);
      try {
        setPhotoDataUrl(await prepareIssuePhoto(file));
      } catch (error) {
        setPhotoDataUrl("");
        setPhotoError(error instanceof Error ? error.message : t("photoPreparationError"));
      } finally {
        setPhotoPreparing(false);
    }
  }

  async function toggleIssueLike(issue: Issue) {
    if (!issue.apiBacked) {
      setIssues((current) => current.map((item) => item.id === issue.id
        ? { ...item, likedByMe: !item.likedByMe, likes: item.likes + (item.likedByMe ? -1 : 1) }
        : item));
      return;
    }
    setCivicError("");
    try {
      const { ticket } = await civicRequest<{ ticket: Omit<Issue, "likes" | "likedByMe" | "apiBacked"> & { likes?: number } }>(`/api/civic/issues/${encodeURIComponent(issue.id)}/support`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voterId }),
      });
      setIssues((current) => current.map((item) => item.id === issue.id
        ? { ...toIssue(ticket), likedByMe: true }
        : item));
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not support this ticket.");
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>, issue: Issue) {
    event.preventDefault();
    const text = (commentDrafts[issue.id] ?? "").trim();
    if (!text) return;
    setCivicError("");
    try {
      if (issue.apiBacked) {
        const { issue: updatedIssue } = await civicRequest<{ issue: Issue }>(`/api/civic/issues/${encodeURIComponent(issue.id)}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, role: commentRole }),
        });
        setIssues((current) => current.map((item) => item.id === issue.id ? toIssue(updatedIssue) : item));
      } else {
        setIssues((current) => current.map((item) => item.id === issue.id
          ? { ...item, comments: [...item.comments, { id: crypto.randomUUID(), text, role: "Example comment" }] }
          : item));
      }
      setCommentDrafts((current) => ({ ...current, [issue.id]: "" }));
      if (issue.apiBacked) setStats(await civicRequest<CivicStats>("/api/civic/stats"));
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not add your comment.");
    }
  }

  async function addIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCivicError("");
    try {
      const { idea } = await civicRequest<{ idea: CivicIdea }>("/api/civic/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: ideaTitle.trim(),
          description: ideaDescription.trim(),
          category: ideaCategory,
          country: ideaCountry,
        }),
      });
      setIdeas((current) => [{ ...idea, comments: [], apiBacked: true }, ...current]);
      setIdeaTitle("");
      setIdeaDescription("");
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not share this idea.");
    }
  }

  async function voteForIdea(idea: CivicIdea & { apiBacked?: boolean; likedByMe?: boolean }) {
    if (votedProposalIds.includes(idea.id)) return;
    setCivicError("");
    try {
      if (idea.apiBacked) {
        const { idea: updatedIdea } = await civicRequest<{ idea: CivicIdea }>(`/api/civic/ideas/${encodeURIComponent(idea.id)}/vote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ voterId }),
        });
        setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, ...updatedIdea, apiBacked: true, likedByMe: true } : item));
      } else {
        setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, votes: item.votes + 1 } : item));
      }
      const nextVotes = [...votedProposalIds, idea.id];
      setVotedProposalIds(nextVotes);
      window.localStorage.setItem("bharat-demo-voted-ideas", JSON.stringify(nextVotes));
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not record this demo vote.");
    }
  }

  async function addIdeaComment(event: FormEvent<HTMLFormElement>, idea: CivicIdea & { apiBacked?: boolean }) {
    event.preventDefault();
    const text = (ideaCommentDrafts[idea.id] ?? "").trim();
    if (!text || !idea.apiBacked) return;
    setCivicError("");
    try {
      const { idea: updatedIdea } = await civicRequest<{ idea: CivicIdea }>(`/api/civic/ideas/${encodeURIComponent(idea.id)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, role: commentRole }),
      });
      setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, ...updatedIdea, apiBacked: true } : item));
      setIdeaCommentDrafts((current) => ({ ...current, [idea.id]: "" }));
    } catch (error) {
      setCivicError(error instanceof Error ? error.message : "Could not comment on this idea.");
    }
  }

  return (
    <div className="page-wrap civic-page">
      <section className="civic-hero">
        <div className="civic-hero-content">
          <div className="eyebrow"><span className="eyebrow-rule" /> {t("heroEyebrow")}</div>
          <h1>{t("heroTitle")}<br />{t("heroTitleEnd")} <em>{t("heroAccent")}</em></h1>
          <p>{t("heroBody")}</p>
          <div className="civic-hero-actions">
            <a className="hero-primary-link" href="#post-issue">{t("shareIssue")} <ArrowRight size={15} /></a>
            <a className="hero-secondary-link" href="#community-issues">{t("explorePosts")}</a>
          </div>
          <div className="civic-hero-foot"><span>{t("heroPillPeople")}</span><span>{t("heroPillPrivacy")}</span><span>{t("heroPillEvolve")}</span></div>
        </div>
        <div className="civic-hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-art-core"><MapPin size={28} /></div>
          <span className="hero-art-dot dot-one" />
          <span className="hero-art-dot dot-two" />
          <span className="hero-art-dot dot-three" />
          <div className="hero-art-label"><MessageCircle size={14} /><span>{t("listenFirst")}<br /><strong>{t("buildTogether")}</strong></span></div>
        </div>
        <span className="build-badge civic-demo-badge"><span className="status-dot offline" /> {t("earlyDemo")}</span>
      </section>

      <div className="pilot-notice" role="note">
        <CircleHelp size={16} />
        <p><strong>{t("noticeTitle")}</strong> {t("noticeBody")}</p>
      </div>

      <section className="civic-overview" aria-label="Civic ticket overview">
        <div className="overview-heading">
          <div><span className="step-label">{t("activity")}</span><h2>{t("overviewTitle")}</h2></div>
          <span className={`service-state ${apiState}`}><span className="status-dot" />{apiState === "online" ? t("localConnected") : apiState === "loading" ? t("loadingDemo") : t("localUnavailable")}</span>
        </div>
        <div className="overview-stat-grid">
          <article className="overview-stat"><span>{t("totalTickets")}</span><strong>{stats.totalTickets}</strong><small>{t("createdDemo")}</small></article>
          <article className="overview-stat"><span>{t("openTickets")}</span><strong>{stats.openTickets}</strong><small>{t("awaitingOutcome")}</small></article>
          <article className="overview-stat"><span>{t("topCategory")}</span><strong className="top-category">{stats.categories[0] ? localizedCategory(language, stats.categories[0].category) : "—"}</strong><small>{stats.categories[0] ? `${stats.categories[0].count} ${t("ticketsFiled")}` : t("noSubmittedTickets")}</small></article>
          <article className="overview-stat presence-stat">
            <span><i className={`presence-indicator ${presenceState}`} aria-hidden="true" />{t("activeNow")}</span>
            <strong>{activeBrowsers ?? "—"}</strong>
            <small role="status" aria-live="polite">{presenceState === "offline" ? t("presenceUnavailable") : t("activeBrowserSessions")}</small>
          </article>
        </div>
        <div className="overview-breakdown">
          <div><h3>{t("categories")}</h3>
            {stats.categories.length ? stats.categories.slice(0, 5).map((item) => (
              <div className="breakdown-row" key={item.category}><span>{localizedCategory(language, item.category)}</span><strong>{item.count}</strong></div>
            )) : <p>{t("noTicketsYet")}</p>}
          </div>
          <div><h3>{t("places")}</h3>
            {stats.places.length ? stats.places.slice(0, 5).map((item) => (
              <div className="breakdown-row" key={item.place}><span>{item.place}</span><strong>{item.count}</strong></div>
            )) : <p>{t("placeTotals")}</p>}
          </div>
          <div className="overview-caveat"><CircleHelp size={15} /><p>{t("statsCaveat")}</p></div>
        </div>
      </section>

      <section className="issue-board-section" id="community-issues" aria-labelledby="issue-board-title">
        <div className="section-heading issue-board-heading">
          <div>
            <span className="step-label">{t("register")}</span>
            <h2 id="issue-board-title">{t("ticketHeadline")}</h2>
            <p className="issue-section-intro">{t("ticketIntro")}</p>
          </div>
          <span className="issue-total"><span className={`status-dot ${apiState === "online" ? "online" : "offline"}`} /> {stats.totalTickets} {t("ticketsFiled")}</span>
        </div>
        <p className="issue-ranking-note"><strong>{t("ticketNotice")}</strong> {t("rankingNotice")}</p>

        {civicError && <div className="civic-error" role="alert">{civicError}</div>}

        <div className="issue-board-grid">
          <form className="panel issue-compose-panel" id="post-issue" onSubmit={addIssue}>
            <div className="panel-heading">
              <div><span className="step-label">{t("yourVoice")}</span><h2>{t("shareConcern")}</h2></div>
              <span className="panel-icon"><MessageCircle size={17} /></span>
            </div>
            <p className="compose-intro">{t("composeIntro")}</p>
            <label className="field-label" htmlFor="issue-title">{t("issueTitle")}</label>
            <input id="issue-title" className="civic-input" value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} maxLength={90} placeholder={t("titlePlaceholder")} required />
            <div className="field-meta"><span>{t("titleHelp")}</span><span>{issueTitle.length}/90</span></div>

            <div className="voice-field-heading issue-label-gap">
              <label className="field-label" htmlFor="issue-description">{t("context")}</label>
              <button className="voice-button" type="button" onClick={() => toggleVoiceEntry("issue")} aria-pressed={listeningField === "issue"} aria-label={listeningField === "issue" ? t("stopVoice") : t("startVoice")}>
                {listeningField === "issue" ? <MicOff size={14} /> : <Mic size={14} />}
                {listeningField === "issue" ? t("listeningNow") : t("startVoice")}
              </button>
            </div>
            <textarea id="issue-description" className="issue-description-input" value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} maxLength={280} placeholder={t("contextPlaceholder")} required />
            <div className="field-meta"><span>{t("localOnly")}</span><span>{issueDescription.length}/280</span></div>
            <small className="voice-privacy">{t("microphoneNotice")}</small>
            {voiceError && voiceErrorField === "issue" && <p className="location-error" role="alert">{voiceError}</p>}

            <div className="issue-fields-row">
              <div>
                <label className="field-label" htmlFor="issue-category">{t("category")}</label>
                <select id="issue-category" className="civic-input" value={issueCategory} onChange={(event) => setIssueCategory(event.target.value)}>
                  {issueCategories.map((category) => <option key={category} value={category}>{localizedCategory(language, category)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="issue-priority">{t("importance")}</label>
                <select id="issue-priority" className="civic-input" value={issuePriority} onChange={(event) => setIssuePriority(event.target.value as Priority)}>
                  <option value="high">{t("priorityHigh")}</option>
                  <option value="medium">{t("priorityMedium")}</option>
                  <option value="low">{t("priorityLow")}</option>
                </select>
              </div>
            </div>
            <label className="field-label issue-label-gap" htmlFor="issue-country">{t("reportingLevel")}</label>
            <select id="issue-country" className="civic-input" value={scope} onChange={(event) => {
              setScope(event.target.value);
              setStateOrProvince("");
              setDistrict("");
              setLocality("");
            }}>
              <option value="locality">{t("localityLevel")}</option>
              <option value="district">{t("districtLevel")}</option>
              <option value="state">{t("stateLevel")}</option>
              <option value="country">{t("countryLevel")}</option>
            </select>
            {scope !== "global" && (
              <>
                <label className="field-label issue-label-gap" htmlFor="ticket-country">{t("country")}</label>
                <select id="ticket-country" className="civic-input" value={country} onChange={(event) => {
                  setCountry(event.target.value);
                  setStateOrProvince("");
                  setDistrict("");
                  setLocality("");
                  setLocationError("");
                }} required>
                  <option value="">{t("chooseCountry")}</option>
                  {countries.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <small className="location-help">{t("countryHelp")}</small>
                <label className="field-label issue-label-gap" htmlFor="ticket-pincode">{t("pincode")}</label>
                <div className="pincode-lookup">
                  <input
                    id="ticket-pincode"
                    className="civic-input"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    value={pincode}
                    onChange={(event) => {
                      pincodeRequestId.current += 1;
                      setPincodeLoading(false);
                      setPincode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      setPincodeError("");
                      setPincodeOffices([]);
                      setSelectedPincodeOffice("");
                      setStateOrProvince("");
                      setDistrict("");
                      setLocality("");
                    }}
                    placeholder={t("pincodePlaceholder")}
                    aria-describedby="pincode-help"
                  />
                  <button type="button" className="voice-button" onClick={() => void lookupPincode()} disabled={pincodeLoading || pincode.length !== 6}>
                    {pincodeLoading ? t("pincodeSearching") : t("findPincode")}
                  </button>
                </div>
                <small id="pincode-help" className="location-help">{t("pincodeHelp")}</small>
                {pincodeOffices.length > 1 && (
                  <>
                    <label className="field-label issue-label-gap" htmlFor="pincode-office">{t("choosePostOffice")}</label>
                    <select id="pincode-office" className="civic-input" value={selectedPincodeOffice} onChange={(event) => {
                      const office = pincodeOffices.find((item) => item.locality === event.target.value);
                      if (office) applyPincodeOffice(office);
                    }}>
                      {pincodeOffices.map((office, index) => <option key={`${office.locality}-${index}`} value={office.locality}>{office.locality} · {office.district}</option>)}
                    </select>
                  </>
                )}
                {pincodeError && <p className="location-error" role="status">{pincodeError}</p>}
              </>
            )}
            {["state", "district", "locality"].includes(scope) && (
              <>
                <label className="field-label issue-label-gap" htmlFor="ticket-state">{t("stateProvince")}</label>
                {states.length || statesLoading ? <select id="ticket-state" className="civic-input" value={stateOrProvince} disabled={statesLoading} onChange={(event) => {
                  setStateOrProvince(event.target.value);
                  setDistrict("");
                  setLocality("");
                  setLocationError("");
                }} required>
                  <option value="">{statesLoading ? t("loadingLocations") : t("chooseState")}</option>
                  {stateOrProvince && !states.some((item) => item.toLowerCase() === stateOrProvince.toLowerCase()) && <option value={stateOrProvince}>{stateOrProvince} · {t("pinDirectoryValue")}</option>}
                  {states.map((item) => <option key={item} value={item}>{item}</option>)}
                </select> : <input id="ticket-state" className="civic-input" value={stateOrProvince} onChange={(event) => {
                  setStateOrProvince(event.target.value);
                  setDistrict("");
                  setLocality("");
                  setLocationError("");
                }} maxLength={80} required placeholder={statesLoading ? t("loadingLocations") : t("manualState")} />}
              </>
            )}
            {["district", "locality"].includes(scope) && stateOrProvince && <>
              <label className="field-label issue-label-gap" htmlFor="ticket-district">{t("districtCounty")}</label>
              {districts.length || districtsLoading ? <select id="ticket-district" className="civic-input" value={district} disabled={districtsLoading} onChange={(event) => setDistrict(event.target.value)} required>
                <option value="">{districtsLoading ? t("loadingLocations") : t("chooseDistrict")}</option>
                {district && !districts.some((item) => item.toLowerCase() === district.toLowerCase()) && <option value={district}>{district} · {t("pinDirectoryValue")}</option>}
                {districts.map((item) => <option key={item} value={item}>{item}</option>)}
              </select> : <input id="ticket-district" className="civic-input" value={district} onChange={(event) => setDistrict(event.target.value)} maxLength={100} required placeholder={districtsLoading ? t("loadingLocations") : t("manualDistrict")} />}
              {!districtsLoading && districts.length === 0 && <small className="location-help">{t("manualDistrict")}</small>}
            </>}
            {scope === "locality" && district && <>
              <label className="field-label issue-label-gap" htmlFor="ticket-locality">{t("townVillage")}</label>
              <input id="ticket-locality" list="place-options" className="civic-input" value={locality} onChange={(event) => setLocality(event.target.value)} maxLength={100} required placeholder={locationsLoading ? t("loadingLocations") : t("localityPlaceholder")} />
              <datalist id="place-options">{places.map((item) => <option key={item} value={item} />)}</datalist>
              <small className="location-help">{t("localityHelp")}</small>
            </>}
            <div className="optional-location-panel">
              <span className="field-label">{t("pinOnMap")} <span className="optional-label">{t("optionalField")}</span></span>
              <p className="location-help">{t("mapLocationPrivacy")}</p>
              <button className="voice-button location-action" type="button" onClick={useCurrentLocation}>
                <MapPin size={14} /> {issueLocation ? t("refreshMapLocation") : t("useCurrentLocation")}
              </button>
              <span className="location-help">{t("enterMapCoordinates")}</span>
              <div className="coordinate-inputs">
                <label><span>{t("latitude")}</span><input className="civic-input" inputMode="decimal" value={latitudeDraft} onChange={(event) => updateManualCoordinates(event.target.value, longitudeDraft)} placeholder="12.9716" /></label>
                <label><span>{t("longitude")}</span><input className="civic-input" inputMode="decimal" value={longitudeDraft} onChange={(event) => updateManualCoordinates(latitudeDraft, event.target.value)} placeholder="77.5946" /></label>
              </div>
              {locationPermissionError && <p className="location-error" role="status">{locationPermissionError}</p>}
              {issueLocation && (
                <div className="location-pin-preview">
                  <span>{t("pinReady")}: {issueLocation.latitude.toFixed(shareExactLocation ? 6 : 3)}, {issueLocation.longitude.toFixed(shareExactLocation ? 6 : 3)}</span>
                  {shareExactLocation && issueLocation.altitude !== undefined && <span>{t("altitude")}: {Math.round(issueLocation.altitude)} m</span>}
                  <a href={`https://www.google.com/maps?q=${shareExactLocation ? issueLocation.latitude : issueLocation.latitude.toFixed(3)},${shareExactLocation ? issueLocation.longitude : issueLocation.longitude.toFixed(3)}`} target="_blank" rel="noreferrer">{t("previewMapPin")}</a>
                </div>
              )}
              <label className="location-precision-choice">
                <input type="checkbox" checked={shareExactLocation} onChange={(event) => setShareExactLocation(event.target.checked)} />
                <span>{t("shareExactPin")}</span>
              </label>
            </div>
            <div className="optional-photo-panel">
              <label className="field-label" htmlFor="issue-photo">{t("addPhoto")} <span className="optional-label">{t("optionalField")}</span></label>
              <input id="issue-photo" ref={photoInputRef} className="photo-input" type="file" accept="image/*" onChange={(event) => void handlePhotoSelection(event.target.files?.[0])} />
              <small className="location-help">{t("photoPrivacy")}</small>
              {photoError && <p className="location-error" role="alert">{photoError}</p>}
              {photoDataUrl && (
                <div className="photo-preview">
                  <img src={photoDataUrl} alt={t("photoPreviewAlt")} />
                  <button type="button" className="voice-button" onClick={() => {
                    setPhotoDataUrl("");
                    if (photoInputRef.current) photoInputRef.current.value = "";
                  }}>{t("removePhoto")}</button>
                </div>
              )}
            </div>
            {locationError && <p className="location-error" role="status">{locationError} {t("manualPlace")}</p>}
            {createdTicketId && <p className="ticket-created-message" role="status"><strong>{t("ticketCreated")}</strong> {createdTicketId} · {t("demoNotFiled")}</p>}

            {categorySuggestion && (
              <div className="category-suggestion" aria-live="polite">
                <div><span>{t("categorySuggestionLabel")}</span><strong>{localizedCategory(language, categorySuggestion)}</strong></div>
                <small>{t("categorySuggestionNote")}</small>
                {categorySuggestion !== issueCategory && <button type="button" onClick={() => setIssueCategory(categorySuggestion)}>{t("useCategorySuggestion")}</button>}
              </div>
            )}
            <div className="routing-preview" aria-live="polite">
              <span className="step-label">{t("routingPreview")}</span>
              <small>{t("routingForCategory")}: {localizedCategory(language, issueCategory)}</small>
              <strong>{suggestedRecipient}</strong>
              <small>{t("routingDisclaimer")}</small>
            </div>

            <div className="issue-compose-footer">
              <span><TriangleAlert size={14} /> {t("safetyPrivacy")}</span>
              <button className="primary-button" type="submit" disabled={apiState !== "online" || isCreatingTicket || photoPreparing || !issueTitle.trim() || !issueDescription.trim()}>
                {isCreatingTicket ? t("creatingTicket") : photoPreparing ? t("photoOptimizing") : t("createTicket")} <ArrowRight size={14} />
              </button>
            </div>
          </form>

          <div className="issue-feed">
            <div className="issue-feed-toolbar">
            <div><strong>{t("ticketsDiscussion")}</strong><span>{visibleIssues.length} · {t("ticketRecords")}</span></div>
            <label className="sort-control"><span>{t("sortBy")}</span><select value={issueSort} onChange={(event) => setIssueSort(event.target.value as typeof issueSort)} aria-label={t("sortBy")}><option value="priority">{t("sortPriority")}</option><option value="likes">{t("mostSupported")}</option><option value="discussion">{t("mostDiscussed")}</option></select></label>
            </div>
            <div className="role-selector">
            <label htmlFor="comment-role">{t("commentingAs")}</label>
              <select id="comment-role" value={commentRole} onChange={(event) => setCommentRole(event.target.value)}>
              <option value="Community member">{t("roleCommunity")}</option>
              <option value="Subject expert (unverified)">{t("roleExpert")}</option>
              <option value="Public authority (unverified)">{t("roleAuthority")}</option>
              </select>
            <span>{t("roleDisclosure")}</span>
            </div>
            <div className="issue-filters">
            <label><span>{t("filterCountry")}</span><select value={filters.country} onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value, state: "", district: "", locality: "" }))}><option value="">{t("allCountries")}</option>{availableCountries.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>{t("filterState")}</span><select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value, district: "", locality: "" }))}><option value="">{t("allStates")}</option>{availableStates.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>{t("filterDistrict")}</span><input value={filters.district} onChange={(event) => setFilters((current) => ({ ...current, district: event.target.value }))} placeholder={t("filterPlaceholder")} /></label>
            <label><span>{t("filterLocality")}</span><input value={filters.locality} onChange={(event) => setFilters((current) => ({ ...current, locality: event.target.value }))} placeholder={t("filterPlaceholder")} /></label>
            <label><span>{t("filterCategory")}</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">{t("allCategories")}</option>{issueCategories.map((item) => <option key={item} value={item}>{localizedCategory(language, item)}</option>)}</select></label>
            </div>
          <div className="issue-list" aria-live="polite">
            {visibleIssues.map((issue, index) => (
              <article className="panel issue-card" key={issue.id}>
                <div className="issue-card-header">
                  <span className="issue-rank">#{String(index + 1).padStart(2, "0")}</span>
                    <span className="category-tag">{localizedCategory(language, issue.category)}</span>
                    <span className={`priority-pill ${issue.priority}`}>{localizePriority(language, issue.priority)} {t("importanceSuffix")}</span>
                    <span className="sample-count">{issue.isSample ? t("example") : issue.id}</span>
                </div>
                <h3>{issue.title}</h3>
                <p className="issue-description">{issue.description}</p>
                <div className="issue-location"><MapPin size={13} /> {issue.area}</div>
                {issue.location && <a className="issue-map-link" href={`https://www.google.com/maps?q=${issue.location.latitude},${issue.location.longitude}`} target="_blank" rel="noreferrer">
                  <MapPin size={13} /> {t("viewMapPin")}{issue.location.altitude === undefined ? "" : ` · ${Math.round(issue.location.altitude)} m`}
                </a>}
                {issue.photoUrl && <a className="issue-photo-link" href={issue.photoUrl} target="_blank" rel="noreferrer">
                  <img className="issue-photo" src={issue.photoUrl} alt={t("publicIssuePhoto")} loading="lazy" />
                  <span>{t("publicIssuePhoto")}</span>
                </a>}
                <div className="ticket-status-line"><span className={`ticket-status ${issue.isSample ? "example" : ""}`}><span className="status-dot" />{issue.status === "Submitted" ? t("submitted") : issue.status ?? t("submitted")}</span><span>{issue.isSample ? t("illustrative") : t("demoNotFiled")}</span></div>
                <div className="issue-routing"><span>{t("suggestedDesk")}</span><strong>{suggestOffice(issue.category, issue.scope ?? "district", issue.country ?? "India", issue.state ?? "", issue.district ?? "", `${issue.title}\n${issue.description}`)}</strong><small>{t("notAnAssignment")}</small></div>
                <div className="issue-engagement">
                  <button className={`issue-action ${issue.likedByMe ? "liked" : ""}`} type="button" onClick={() => void toggleIssueLike(issue)} aria-pressed={issue.likedByMe} aria-label={`${t("support")} ${issue.id}`}>
                    <Heart size={15} fill={issue.likedByMe ? "currentColor" : "none"} /> {issue.likes} <span>{t("supporters")}</span>
                  </button>
                  <span className="issue-comment-count"><MessageSquareText size={14} /> {issue.comments.length} <span>{t("comments")}</span></span>
                </div>
                <div className="issue-comments">
                  {issue.comments.slice(-2).map((comment) => (
                    <p className="issue-comment" key={comment.id}><span>{comment.role ?? "Community member"}</span>{comment.text}</p>
                  ))}
                  <form className="comment-form" onSubmit={(event) => void addComment(event, issue)}>
                    <label className="sr-only" htmlFor={`comment-${issue.id}`}>{t("commentPlaceholder")} {issue.title}</label>
                    <input
                      id={`comment-${issue.id}`}
                      value={commentDrafts[issue.id] ?? ""}
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [issue.id]: event.target.value }))}
                      maxLength={180}
                      placeholder={t("commentPlaceholder")}
                    />
                    <button type="submit" disabled={apiState !== "online" || !(commentDrafts[issue.id] ?? "").trim()} aria-label={`Post comment on ${issue.title}`}><Send size={14} /></button>
                  </form>
                </div>
              </article>
            ))}
            {visibleIssues.length === 0 &&             <p className="empty-feed">{t("noMatchingTickets")}</p>}
          </div>
          </div>
        </div>
      </section>

      <div className="civic-workspace">
        <section className="panel civic-assistant-panel">
          <div className="panel-heading">
          <div><span className="step-label">{t("guideEyebrow")}</span><h2>{t("guideTitle")}</h2></div>
            <span className="panel-icon"><Bot size={17} /></span>
          </div>
          <div className="assistant-disclosure"><span className="rule-pill"><span className="status-dot" /> {t("simpleRules")}</span><span>{t("notAuthority")}</span></div>
          <div className="chat-thread" aria-live="polite">
            {submittedQuestion ? (
              <>
              <div className="chat-message user"><span>{t("you")}</span><p>{submittedQuestion}</p></div>
                {guidance && (
                  <div className="chat-message assistant">
                  <span>{t("guidancePreview")} · {localizedCategory(language, guidance.category)}</span>
                    <p>{guidance.nextStep}</p>
                  <small>{t("possibleAuthority")} {guidance.department}. {t("verifyChannel")}</small>
                  </div>
                )}
              </>
            ) : (
            <div className="chat-message assistant"><span>{t("guideDemo")}</span><p>{t("guideWelcome")}</p></div>
            )}
          </div>
          <form onSubmit={handleGuidance}>
          <div className="voice-field-heading">
            <label className="field-label" htmlFor="civic-description">{t("guideLabel")}</label>
            <button className="voice-button" type="button" onClick={() => toggleVoiceEntry("guide")} aria-pressed={listeningField === "guide"} aria-label={listeningField === "guide" ? t("stopVoice") : t("startVoice")}>
              {listeningField === "guide" ? <MicOff size={14} /> : <Mic size={14} />}
              {listeningField === "guide" ? t("listeningNow") : t("startVoice")}
            </button>
          </div>
            <textarea
              id="civic-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder={t("guidePlaceholder")}
              required
            />
            <div className="field-meta"><span>{t("guidePrivacy")}</span><span>{description.length}/500</span></div>
            <small className="voice-privacy">{t("microphoneNotice")}</small>
            {voiceError && voiceErrorField === "guide" && <p className="location-error" role="alert">{voiceError}</p>}
            <div className="civic-form-footer">
              <span className="model-note"><span className="status-dot offline" /> Stays in this page's memory</span>
              <button className="primary-button" type="submit" disabled={!description.trim()}>
                {t("showNextStep")} <ArrowRight size={14} />
              </button>
            </div>
          </form>
          <div className="civic-safety-note"><TriangleAlert size={15} /><span>{t("emergencyNote")}</span></div>
        </section>

      </div>

      <section className="civic-proposals">
        <div className="section-heading">
          <div><span className="step-label">{t("ideasEyebrow")}</span><h2>{t("ideasTitle")}</h2></div>
          <span className="sample-count">{t("nonBinding")}</span>
        </div>
        <p className="idea-intro">{t("ideasIntro")}</p>
        <form className="panel idea-compose" onSubmit={(event) => void addIdea(event)}>
          <div className="panel-heading">
            <div><span className="step-label">{t("ideaCompose")}</span><h2>{t("ideaQuestion")}</h2></div>
            <span className="panel-icon proposal"><MessageSquareText size={17} /></span>
          </div>
          <div className="idea-form-grid">
            <div>
              <label className="field-label" htmlFor="idea-title">{t("ideaTitle")}</label>
              <input id="idea-title" className="civic-input" value={ideaTitle} onChange={(event) => setIdeaTitle(event.target.value)} maxLength={100} placeholder={t("ideaTitlePlaceholder")} required />
            </div>
            <div>
              <label className="field-label" htmlFor="idea-category">{t("ideaTopic")}</label>
              <select id="idea-category" className="civic-input" value={ideaCategory} onChange={(event) => setIdeaCategory(event.target.value)}>{issueCategories.map((item) => <option key={item} value={item}>{localizedCategory(language, item)}</option>)}</select>
            </div>
            <div>
              <label className="field-label" htmlFor="idea-country">{t("ideaScope")}</label>
              <select id="idea-country" className="civic-input" value={ideaCountry} onChange={(event) => setIdeaCountry(event.target.value)} required>
                <option value="India">India</option>
              </select>
            </div>
            <div className="idea-submit-cell">
              <label className="sr-only" htmlFor="idea-description">{t("ideaDetails")}</label>
              <textarea id="idea-description" className="idea-description-input" value={ideaDescription} onChange={(event) => setIdeaDescription(event.target.value)} maxLength={1200} placeholder={t("ideaDetailsPlaceholder")} required />
              <button className="primary-button" type="submit" disabled={apiState !== "online" || !ideaTitle.trim() || ideaDescription.trim().length < 15}>{t("shareIdea")} <ArrowRight size={14} /></button>
            </div>
          </div>
          <div className="field-meta"><span>{t("ideaSafety")}</span><span>{ideaDescription.length}/1200</span></div>
        </form>
        <div className="proposal-grid">
          {ideas.map((proposal) => {
            const voted = votedProposalIds.includes(proposal.id);
            const idea = proposal as CivicIdea & { apiBacked?: boolean; likedByMe?: boolean };
            return (
              <article className="proposal-card" key={proposal.id}>
                <span className="scenario-category">{proposal.category}</span>
                <h3>{proposal.title}</h3>
                <p>{proposal.description}</p>
                <div className="proposal-footer">
                  <span className="proposal-vote-count"><ThumbsUp size={14} /> {proposal.votes} {proposal.isSample ? t("illustrativeVotes") : t("voteSupporters")}</span>
                  <button className={`vote-button ${voted ? "voted" : ""}`} type="button" onClick={() => void voteForIdea(idea)} aria-pressed={voted} disabled={voted || apiState !== "online"}>
                    {voted ? <Check size={14} /> : <ThumbsUp size={14} />}
                    {voted ? t("supportRecorded") : proposal.isSample ? t("sampleVote") : t("supportIdea")}
                  </button>
                </div>
                {proposal.comments?.slice(-2).map((comment) => <p className="issue-comment idea-comment" key={comment.id}><span>{comment.role ?? "Community member"}</span>{comment.text}</p>)}
                {idea.apiBacked && (
                  <form className="comment-form idea-comment-form" onSubmit={(event) => void addIdeaComment(event, idea)}>
                    <label className="sr-only" htmlFor={`idea-comment-${idea.id}`}>{t("commentOnIdea")} {idea.title}</label>
                    <input id={`idea-comment-${idea.id}`} value={ideaCommentDrafts[idea.id] ?? ""} onChange={(event) => setIdeaCommentDrafts((current) => ({ ...current, [idea.id]: event.target.value }))} maxLength={500} placeholder={t("ideaCommentPlaceholder")} />
                    <button type="submit" disabled={apiState !== "online" || !(ideaCommentDrafts[idea.id] ?? "").trim()} aria-label={`Post comment on idea ${idea.title}`}><Send size={14} /></button>
                  </form>
                )}
                {proposal.isSample && <span className="idea-sample-note">{t("sampleIdeaNote")}</span>}
              </article>
            );
          })}
        </div>
      </section>

      <div className="pilot-next-step">
        <div><span className="step-label">{t("trustEyebrow")}</span><strong>{t("trustTitle")}</strong></div>
        <p>{t("trustBody")}</p>
      </div>

      <footer className="page-footnote"><span>Bharat AI Research · {t("heroEyebrow")}</span><span>{t("prototypeOnly")}</span><span><CircleHelp size={13} /> {t("verifyOfficialSources")}</span></footer>
    </div>
  );
}

export default CivicPilot;
