import {
  PrismaClient,
  LeadStatus,
  DealStage,
  ClientStatus,
  TaskStatus,
  ContentStatus,
  ReportStatus,
  RankRentStatus,
  SaaSRoadmapStatus,
  TaskPriority,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ONBOARDING_TEMPLATE: { key: string; label: string; sortOrder: number }[] =
  [
    { key: "payment_confirmed", label: "Payment confirmed", sortOrder: 1 },
    { key: "welcome_email_sent", label: "Welcome email sent", sortOrder: 2 },
    {
      key: "onboarding_form_sent",
      label: "Onboarding form sent",
      sortOrder: 3,
    },
    {
      key: "gbp_access_received",
      label: "GBP access received",
      sortOrder: 4,
    },
    { key: "ga4_access_received", label: "GA4 access received", sortOrder: 5 },
    { key: "gsc_access_received", label: "GSC access received", sortOrder: 6 },
    {
      key: "website_access_received",
      label: "Website access received",
      sortOrder: 7,
    },
    {
      key: "hosting_access_received",
      label: "Hosting access received",
      sortOrder: 8,
    },
    {
      key: "brand_assets_received",
      label: "Brand assets received",
      sortOrder: 9,
    },
    {
      key: "competitors_collected",
      label: "Competitors collected",
      sortOrder: 10,
    },
    {
      key: "target_services_confirmed",
      label: "Target services confirmed",
      sortOrder: 11,
    },
    {
      key: "target_locations_confirmed",
      label: "Target locations confirmed",
      sortOrder: 12,
    },
    {
      key: "kickoff_call_scheduled",
      label: "Kickoff call scheduled",
      sortOrder: 13,
    },
    {
      key: "baseline_audit_started",
      label: "Baseline audit started",
      sortOrder: 14,
    },
  ];

async function main() {
  const passwordPlain =
    process.env.SEED_ADMIN_PASSWORD ?? "ValiantDemo!2026";
  const passwordHash = await bcrypt.hash(passwordPlain, 12);

  const founderRole = await prisma.role.upsert({
    where: { key: "FOUNDER" },
    update: {},
    create: { key: "FOUNDER", label: "Founder" },
  });
  const opsRole = await prisma.role.upsert({
    where: { key: "OPS" },
    update: {},
    create: { key: "OPS", label: "Operations" },
  });
  const salesRole = await prisma.role.upsert({
    where: { key: "SALES" },
    update: {},
    create: { key: "SALES", label: "Sales" },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "valiant-firm" },
    update: { name: "Valiant Firm" },
    create: { name: "Valiant Firm", slug: "valiant-firm" },
  });

  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? "founder@valiantfirm.agency";

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: "Founder" },
    create: {
      email: adminEmail,
      name: "Founder",
      passwordHash,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    update: { roleId: founderRole.id },
    create: {
      organizationId: org.id,
      userId: user.id,
      roleId: founderRole.id,
    },
  });

  await prisma.setting.upsert({
    where: {
      organizationId_key: {
        organizationId: org.id,
        key: "brand.accent",
      },
    },
    update: { value: "#D30404" },
    create: {
      organizationId: org.id,
      key: "brand.accent",
      value: "#D30404",
    },
  });

  const leadsData = [
    {
      businessName: "Summit Gutter Co.",
      niche: "Gutters",
      city: "Denver",
      state: "CO",
      websiteUrl: "https://summitgutter.example",
      phone: "3035550101",
      email: "owner@summitgutter.example",
      source: "Maps scrape",
      domainAuthority: 18,
      reviewCount: 42,
      starRating: 4.6,
      gbpStatus: "Incomplete categories",
      websiteStatus: "Thin service pages",
      weaknessTags: ["weak_schema", "thin_content"],
      leadScore: 88,
      status: LeadStatus.OutreachQueue,
      recommendedOffer: "Local SEO + GBP overhaul",
      outreachAngle: "Missed storm-season capture",
    },
    {
      businessName: "Peak Roofing Partners",
      niche: "Roofing",
      city: "Austin",
      state: "TX",
      websiteUrl: "https://peakroofing.example",
      phone: "5125550142",
      email: "sales@peakroofing.example",
      source: "Referral",
      domainAuthority: 27,
      reviewCount: 118,
      starRating: 4.8,
      gbpStatus: "Strong",
      websiteStatus: "Slow LCP",
      weaknessTags: ["cwv", "competitor_gap"],
      leadScore: 76,
      status: LeadStatus.InSequence,
      recommendedOffer: "Website + SEO sprint",
      outreachAngle: "Speed vs competitors",
    },
    {
      businessName: "Arctic Air HVAC",
      niche: "HVAC",
      city: "Phoenix",
      state: "AZ",
      websiteUrl: "https://arcticairhvac.example",
      phone: "6025550199",
      email: "dispatch@arcticairhvac.example",
      source: "Cold outbound",
      domainAuthority: 22,
      reviewCount: 210,
      starRating: 4.4,
      gbpStatus: "Duplicate categories",
      websiteStatus: "Duplicate titles",
      weaknessTags: ["dup_meta", "gbp_dup"],
      leadScore: 71,
      status: LeadStatus.Replied,
      recommendedOffer: "Technical SEO + GBP cleanup",
      outreachAngle: "Indexation waste",
    },
    {
      businessName: "Precision Auto Body",
      niche: "Auto body",
      city: "Tampa",
      state: "FL",
      websiteUrl: "https://precisionautobody.example",
      phone: "8135550177",
      email: "office@precisionautobody.example",
      source: "LinkedIn",
      domainAuthority: 15,
      reviewCount: 36,
      starRating: 4.2,
      gbpStatus: "Missing services",
      websiteStatus: "No schema",
      weaknessTags: ["no_schema", "review_velocity_low"],
      leadScore: 69,
      status: LeadStatus.CallBooked,
      recommendedOffer: "Local SEO foundation",
      outreachAngle: "Insurance funnel gaps",
    },
    {
      businessName: "Bright Smile Dental",
      niche: "Dental",
      city: "Nashville",
      state: "TN",
      websiteUrl: "https://brightsmile.example",
      phone: "6155550110",
      email: "frontdesk@brightsmile.example",
      source: "Inbound",
      domainAuthority: 31,
      reviewCount: 520,
      starRating: 4.9,
      gbpStatus: "Optimized",
      websiteStatus: "Needs AEO content",
      weaknessTags: ["aeo_gap"],
      leadScore: 62,
      status: LeadStatus.Qualified,
      recommendedOffer: "AEO / FAQ expansion",
      outreachAngle: "AI overview visibility",
    },
    {
      businessName: "Atlas Remodeling",
      niche: "Remodeling",
      city: "Seattle",
      state: "WA",
      websiteUrl: "https://atlasremodel.example",
      phone: "2065550133",
      email: "projects@atlasremodel.example",
      source: "Apollo",
      domainAuthority: 24,
      reviewCount: 74,
      starRating: 4.5,
      gbpStatus: "Photos stale",
      websiteStatus: "Cannibalization",
      weaknessTags: ["cannibalization"],
      leadScore: 58,
      status: LeadStatus.Raw,
      recommendedOffer: "Content architecture",
      outreachAngle: "Kitchen vs bath overlap",
    },
    {
      businessName: "RapidFlow Plumbing",
      niche: "Plumbing",
      city: "Atlanta",
      state: "GA",
      websiteUrl: "https://rapidflowplumbing.example",
      phone: "4045550166",
      email: "dispatch@rapidflowplumbing.example",
      source: "Maps scrape",
      domainAuthority: 19,
      reviewCount: 95,
      starRating: 4.3,
      gbpStatus: "Weak Q&A",
      websiteStatus: "Blog decay",
      weaknessTags: ["content_decay"],
      leadScore: 55,
      status: LeadStatus.Archived,
      recommendedOffer: "Refresh + citations",
      outreachAngle: "Emergency keywords",
    },
    {
      businessName: "Evergreen Tree Service",
      niche: "Tree service",
      city: "Portland",
      state: "OR",
      websiteUrl: "https://evergreentree.example",
      phone: "5035550188",
      email: "crew@evergreentree.example",
      source: "Partner",
      domainAuthority: 21,
      reviewCount: 67,
      starRating: 4.7,
      gbpStatus: "Missing attributes",
      websiteStatus: "Weak IA",
      weaknessTags: ["ia", "attributes"],
      leadScore: 73,
      status: LeadStatus.ProposalSent,
      recommendedOffer: "Local SEO retainer",
      outreachAngle: "Storm season prep",
    },
    {
      businessName: "IronShield Gutters",
      niche: "Gutters",
      city: "Chicago",
      state: "IL",
      websiteUrl: "https://ironshield.example",
      phone: "3125550122",
      email: "ops@ironshield.example",
      source: "Cold outbound",
      domainAuthority: 12,
      reviewCount: 22,
      starRating: 4.0,
      gbpStatus: "New listing",
      websiteStatus: "Single page site",
      weaknessTags: ["thin_site"],
      leadScore: 81,
      status: LeadStatus.OutreachQueue,
      recommendedOffer: "Rank-and-rent option",
      outreachAngle: "Expansion corridors",
    },
    {
      businessName: "Nova HVAC Pros",
      niche: "HVAC",
      city: "Dallas",
      state: "TX",
      websiteUrl: "https://novahvac.example",
      phone: "2145550155",
      email: "lead@novahvac.example",
      source: "Web form",
      domainAuthority: 26,
      reviewCount: 305,
      starRating: 4.6,
      gbpStatus: "Reviews plateau",
      websiteStatus: "Cannibal city pages",
      weaknessTags: ["reviews_plateau"],
      leadScore: 67,
      status: LeadStatus.ClosedLost,
      recommendedOffer: "GBP + review ops",
      outreachAngle: "Velocity stalled",
    },
  ];

  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  const leads = await prisma.$transaction(
    leadsData.map((l) =>
      prisma.lead.create({
        data: {
          organizationId: org.id,
          ...l,
        },
      }),
    ),
  );

  await prisma.deal.deleteMany({ where: { organizationId: org.id } });
  await prisma.deal.createMany({
    data: [
      {
        organizationId: org.id,
        leadId: leads[0].id,
        businessName: leads[0].businessName,
        contactName: "Jordan Lee",
        serviceInterest: "Local SEO",
        proposalValue: 12000,
        monthlyValue: 3500,
        stage: DealStage.Outreach,
        closeProbability: 35,
      },
      {
        organizationId: org.id,
        leadId: leads[3].id,
        businessName: leads[3].businessName,
        contactName: "Maria Santos",
        serviceInterest: "Website + SEO",
        proposalValue: 24000,
        monthlyValue: 4200,
        stage: DealStage.CallBooked,
        closeProbability: 55,
        callDate: new Date(),
      },
      {
        organizationId: org.id,
        leadId: leads[8].id,
        businessName: leads[8].businessName,
        contactName: "Chris Allen",
        serviceInterest: "Google Ads",
        proposalValue: 8000,
        monthlyValue: 2800,
        stage: DealStage.ProposalSent,
        closeProbability: 60,
      },
    ],
  });

  await prisma.client.deleteMany({ where: { organizationId: org.id } });
  const clients = await prisma.$transaction([
    prisma.client.create({
      data: {
        organizationId: org.id,
        businessName: "Summit Gutter Co.",
        primaryContact: "Jordan Lee",
        email: "owner@summitgutter.example",
        phone: "3035550101",
        websiteUrl: "https://summitgutter.example",
        servicePurchased: "Local SEO",
        monthlyValue: 3500,
        contractStart: new Date(),
        status: ClientStatus.Active,
        healthScore: 86,
        assignedSeoLead: "Ops · Riley",
        targetLocations: ["Denver", "Boulder"],
        targetServices: ["Gutter install", "Gutter repair"],
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        businessName: "Peak Roofing Partners",
        primaryContact: "Sam Ortiz",
        email: "sales@peakroofing.example",
        phone: "5125550142",
        websiteUrl: "https://peakroofing.example",
        servicePurchased: "Website + SEO",
        monthlyValue: 5200,
        contractStart: new Date(Date.now() - 86400000 * 40),
        status: ClientStatus.Active,
        healthScore: 72,
        assignedSeoLead: "Ops · Morgan",
        targetLocations: ["Austin", "Round Rock"],
        targetServices: ["Roof replacement", "Storm repair"],
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        businessName: "Bright Smile Dental",
        primaryContact: "Dr. Patel",
        email: "frontdesk@brightsmile.example",
        phone: "6155550110",
        websiteUrl: "https://brightsmile.example",
        servicePurchased: "AEO optimization",
        monthlyValue: 4100,
        contractStart: new Date(Date.now() - 86400000 * 12),
        status: ClientStatus.Onboarding,
        healthScore: 68,
        assignedSeoLead: "Ops · Avery",
        targetLocations: ["Nashville"],
        targetServices: ["Cosmetic", "Implants"],
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        businessName: "Evergreen Tree Service",
        primaryContact: "Casey Kim",
        email: "crew@evergreentree.example",
        phone: "5035550188",
        websiteUrl: "https://evergreentree.example",
        servicePurchased: "Local SEO",
        monthlyValue: 2900,
        contractStart: new Date(Date.now() - 86400000 * 120),
        status: ClientStatus.AtRisk,
        healthScore: 52,
        assignedSeoLead: "Ops · Jamie",
        targetLocations: ["Portland", "Beaverton"],
        targetServices: ["Removal", "Trimming"],
      },
    }),
    prisma.client.create({
      data: {
        organizationId: org.id,
        businessName: "Atlas Remodeling",
        primaryContact: "Taylor Brooks",
        email: "projects@atlasremodel.example",
        phone: "2065550133",
        websiteUrl: "https://atlasremodel.example",
        servicePurchased: "SEO audits",
        monthlyValue: 1800,
        contractStart: new Date(Date.now() - 86400000 * 300),
        status: ClientStatus.Paused,
        healthScore: 44,
        assignedSeoLead: "Ops · Drew",
        targetLocations: ["Seattle"],
        targetServices: ["Kitchen", "Bath"],
      },
    }),
  ]);

  for (const c of clients) {
    await prisma.onboardingItem.deleteMany({ where: { clientId: c.id } });
    await prisma.onboardingItem.createMany({
      data: ONBOARDING_TEMPLATE.map((row, i) => ({
        organizationId: org.id,
        clientId: c.id,
        key: row.key,
        label: row.label,
        sortOrder: row.sortOrder,
        completed: i < (c.status === ClientStatus.Active ? 10 : 4),
        completedAt:
          i < (c.status === ClientStatus.Active ? 10 : 4)
            ? new Date()
            : null,
      })),
    });
  }

  await prisma.task.deleteMany({ where: { organizationId: org.id } });
  const taskTitles = [
    "Technical audit",
    "GBP optimization",
    "Citation audit",
    "Priority fixes",
    "Keyword tracking setup",
    "Content brief",
    "On-page SEO batch",
    "Local link outreach",
    "Internal linking pass",
    "Schema optimization",
    "Monthly report draft",
    "AI executive summary",
    "Next 30-day plan",
    "Client Loom update",
    "GBP photo refresh",
    "Review acquisition workflow",
    "FAQ expansion",
    "Entity coverage map",
    "SERP feature audit",
    "Competitor gap sheet",
    "GA4 conversion QA",
  ];

  let t = 0;
  for (const client of clients) {
    for (let w = 0; w < 4; w++) {
      await prisma.task.create({
        data: {
          organizationId: org.id,
          clientId: client.id,
          title: taskTitles[t % taskTitles.length],
          description: "Delivery workflow task",
          serviceType: client.servicePurchased ?? "Local SEO",
          owner: client.assignedSeoLead ?? "Unassigned",
          priority:
            t % 5 === 0
              ? TaskPriority.High
              : TaskPriority.Medium,
          status:
            t % 7 === 0
              ? TaskStatus.Completed
              : t % 6 === 0
                ? TaskStatus.InProgress
                : TaskStatus.Backlog,
          dueDate: new Date(Date.now() + 86400000 * (w + 1)),
          estimatedHours: 2 + (t % 4),
          weekLabel: `Week ${w + 1}`,
        },
      });
      t++;
      if (t >= 20) break;
    }
    if (t >= 20) break;
  }

  await prisma.contentItem.deleteMany({ where: { organizationId: org.id } });
  await prisma.contentItem.create({
    data: {
      organizationId: org.id,
      clientId: clients[0].id,
      title: "Denver gutter installation guide",
      targetKeyword: "gutter installation Denver",
      secondaryKeywords: ["seamless gutters", "gutter guards"],
      location: "Denver, CO",
      service: "Gutters",
      contentType: "Service page",
      wordCount: 1450,
      status: ContentStatus.Draft,
      seoScore: 78,
    },
  });

  await prisma.report.deleteMany({ where: { organizationId: org.id } });
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  for (let i = 0; i < 5; i++) {
    await prisma.report.create({
      data: {
        organizationId: org.id,
        clientId: clients[i % clients.length].id,
        month: months[i],
        organicSessions: 2200 + i * 180,
        organicLeads: 34 + i * 4,
        keywordGrowth: 12 + i,
        backlinkGrowth: 4 + i,
        gbpCalls: 112 + i * 6,
        gbpViews: 5400 + i * 120,
        contentPublished: 3 + (i % 3),
        tasksCompleted: 18 + i,
        issuesFixed: 9 + i,
        reportSummary: "Organic momentum improved; GBP actions up.",
        nextMonthPlan: "Expand FAQs for AEO; tighten internal links.",
        status:
          i < 3 ? ReportStatus.Sent : i === 3 ? ReportStatus.QA : ReportStatus.Draft,
      },
    });
  }

  await prisma.automationLog.deleteMany({ where: { organizationId: org.id } });
  const automations = [
    {
      name: "New Lead to AI Score",
      trigger: "Webhook: lead.created",
      status: "healthy",
      successCount: 820,
      failureCount: 6,
      connectedTools: ["n8n", "OpenAI"],
    },
    {
      name: "Qualified Lead to Outreach",
      trigger: "Score >= 65",
      status: "healthy",
      successCount: 540,
      failureCount: 4,
      connectedTools: ["Instantly", "Make"],
    },
    {
      name: "Positive Reply to Call Booking",
      trigger: "Inbox tag",
      status: "warning",
      successCount: 112,
      failureCount: 9,
      connectedTools: ["Gmail", "Cal.com"],
    },
    {
      name: "Stripe Payment to Onboarding",
      trigger: "checkout.session.completed",
      status: "healthy",
      successCount: 48,
      failureCount: 1,
      connectedTools: ["Stripe", "Supabase"],
    },
    {
      name: "Monthly SEO Data Pull",
      trigger: "Cron weekly",
      status: "healthy",
      successCount: 36,
      failureCount: 0,
      connectedTools: ["GA4", "GSC"],
    },
    {
      name: "Health Score Drop to Retention",
      trigger: "health < 60",
      status: "degraded",
      successCount: 15,
      failureCount: 3,
      connectedTools: ["Slack", "Internal API"],
    },
  ];
  for (const a of automations) {
    await prisma.automationLog.create({
      data: {
        organizationId: org.id,
        ...a,
        lastRun: new Date(Date.now() - 3600000 * (1 + Math.floor(Math.random() * 30))),
      },
    });
  }

  await prisma.aiLog.deleteMany({ where: { organizationId: org.id } });
  const agents = [
    "Lead Scoring Agent",
    "Outreach Agent",
    "Proposal Agent",
    "SEO Audit Agent",
    "Content Brief Agent",
    "Monthly Reporting Agent",
    "Client Health Agent",
    "Founder Strategy Agent",
  ];
  for (let i = 0; i < agents.length; i++) {
    await prisma.aiLog.create({
      data: {
        organizationId: org.id,
        agentName: agents[i],
        inputType: "json",
        outputType: "json",
        tokensUsed: 1200 + i * 150,
        costEstimate: 0.08 + i * 0.01,
        status: i === 5 ? "warning" : "success",
        relatedRecord: leads[i % leads.length].id,
      },
    });
  }

  await prisma.rankRentAsset.deleteMany({ where: { organizationId: org.id } });
  await prisma.rankRentAsset.createMany({
    data: [
      {
        organizationId: org.id,
        niche: "HVAC",
        city: "Fort Worth",
        state: "TX",
        domain: "besthvacfw.example",
        status: RankRentStatus.Ranking,
        targetKeywords: ["hvac repair fort worth", "ac repair"],
        pagesPublished: 22,
        organicTraffic: 1850,
        leadsGenerated: 28,
        renterStatus: "Looking",
        monthlyRevenue: 1200,
        rankStatus: "Page 1 fluctuations",
      },
      {
        organizationId: org.id,
        niche: "Dental",
        city: "Scottsdale",
        state: "AZ",
        domain: "scottsdaledentallead.example",
        status: RankRentStatus.LeadGenerating,
        targetKeywords: ["cosmetic dentist scottsdale"],
        pagesPublished: 18,
        organicTraffic: 980,
        leadsGenerated: 14,
        renterStatus: "Negotiating",
        monthlyRevenue: 2400,
        rankStatus: "Stable top 5",
      },
      {
        organizationId: org.id,
        niche: "Tree service",
        city: "Charlotte",
        state: "NC",
        domain: "charlottetrees.example",
        status: RankRentStatus.ContentPublished,
        targetKeywords: ["tree removal charlotte"],
        pagesPublished: 12,
        organicTraffic: 210,
        leadsGenerated: 2,
        renterStatus: "None",
        monthlyRevenue: 0,
        rankStatus: "Building authority",
      },
      {
        organizationId: org.id,
        niche: "Roofing",
        city: "Tucson",
        state: "AZ",
        domain: "tucsonroofhelp.example",
        status: RankRentStatus.Rented,
        targetKeywords: ["roof repair tucson"],
        pagesPublished: 30,
        organicTraffic: 2400,
        leadsGenerated: 41,
        renterStatus: "Active lease",
        monthlyRevenue: 4500,
        rankStatus: "Dominant local pack",
      },
    ],
  });

  await prisma.saasProduct.deleteMany({ where: { organizationId: org.id } });
  await prisma.saasProduct.createMany({
    data: [
      {
        organizationId: org.id,
        productName: "LocalLeadScore.io",
        targetUser: "Local SEO agencies",
        coreFeatures: ["AI scoring", "GBP diagnostics", "Exports"],
        mvpScope: "Score leads from CSV + webhook",
        pricingModel: "Per-seat + credits",
        status: SaaSRoadmapStatus.MVP,
        priority: 1,
        launchPhase: "Phase 2",
      },
      {
        organizationId: org.id,
        productName: "ProposalOS",
        targetUser: "Founders & sales leads",
        coreFeatures: ["Call notes → proposal", "Pricing tiers"],
        mvpScope: "Templates + AI sections",
        pricingModel: "Subscription",
        status: SaaSRoadmapStatus.Discovery,
        priority: 2,
        launchPhase: "Phase 2",
      },
      {
        organizationId: org.id,
        productName: "AgencyReports.io",
        targetUser: "Account managers",
        coreFeatures: ["GSC/GA4 ingest", "AI summary"],
        mvpScope: "Monthly narrative PDF",
        pricingModel: "Per client record",
        status: SaaSRoadmapStatus.Idea,
        priority: 3,
        launchPhase: "Phase 3",
      },
      {
        organizationId: org.id,
        productName: "RentRank.io",
        targetUser: "Rank-and-rent operators",
        coreFeatures: ["Asset CRM", "Lead routing"],
        mvpScope: "Portfolio dashboard",
        pricingModel: "Rev share tracking",
        status: SaaSRoadmapStatus.Beta,
        priority: 2,
        launchPhase: "Phase 3",
      },
      {
        organizationId: org.id,
        productName: "BriefEngine",
        targetUser: "Content teams",
        coreFeatures: ["SERP-informed briefs", "Schema hints"],
        mvpScope: "Brief API",
        pricingModel: "API credits",
        status: SaaSRoadmapStatus.Idea,
        priority: 4,
        launchPhase: "Phase 4",
      },
      {
        organizationId: org.id,
        productName: "RetainIQ",
        targetUser: "Client success",
        coreFeatures: ["Health score", "Retention playbooks"],
        mvpScope: "Alerts + tasks",
        pricingModel: "Bundle with Agency OS",
        status: SaaSRoadmapStatus.MVP,
        priority: 1,
        launchPhase: "Phase 4",
      },
    ],
  });

  await prisma.founderAlert.deleteMany({ where: { organizationId: org.id } });
  const atRisk = clients.find((c) => c.status === ClientStatus.AtRisk);
  if (atRisk) {
    await prisma.founderAlert.create({
      data: {
        organizationId: org.id,
        clientId: atRisk.id,
        title: "Client health below threshold",
        body: `${atRisk.businessName} dropped under 60 health. Trigger retention workflow.`,
        severity: "high",
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete:", {
    org: org.slug,
    admin: adminEmail,
    password: passwordPlain,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
