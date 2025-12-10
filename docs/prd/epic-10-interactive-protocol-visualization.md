# Epic 10: Interactive Protocol Visualization Landing Page

**Type:** Brownfield Enhancement (Separate Repository)
**Status:** Planned
**Timeline:** 2-3 weeks

---

## Epic Goal

Create an interactive landing page using React Flow UI that visually demonstrates the Nostr-ILP integration protocol through both simple and scaled network graph scenarios, **including fee structures and profitability models for multi-hop routing**, providing an intuitive educational and marketing tool for developers and users to understand both the technical and economic aspects of the network.

---

## Epic Description

### Existing System Context

- **Current relevant functionality:** The nostream-ilp project integrates Nostr (decentralized social protocol) with Interledger Protocol (ILP) for payments, supporting BTP-NIPs event handling, payment channels, peer discovery, and Arweave storage
- **Technology stack:** TypeScript/Node.js backend (Nostream relay), PostgreSQL, Redis, Ethereum smart contracts (Hardhat), with existing test infrastructure using Vitest
- **Integration points:** New frontend will be deployed as separate repository/application that references main project documentation and may import shared TypeScript type definitions for accuracy

### Enhancement Details

#### What's Being Added

A standalone React-based landing page featuring:

1. **Interactive Flow Diagrams** using React Flow UI components
2. **Two Visualization Modes:**
   - **Simple Happy Path:** Basic payment flow showing client → Nostr event → relay (with payment) → ILP routing → settlement → confirmation **with fee breakdown**
   - **Scaled Network Graph:** Complex social graph with multiple peers, payment channels, ILP connectors, and event propagation **demonstrating N-hop routing profitability**
3. **Economic Model Visualization:**
   - Fee structure at each network hop
   - Profitability calculations for intermediate nodes (relays/connectors)
   - Comparison of routing paths (cost vs. speed tradeoffs)
   - Real-time fee accumulation during payment flows
   - Economic incentives for network participation
4. **Modern Tech Stack:**
   - React 19
   - React Flow UI components
   - shadcn/ui component library
   - Tailwind CSS 4
   - TypeScript
5. **Interactive Features:**
   - Animated flow progression with fee accumulation
   - Node tooltips with fee breakdowns and explanations
   - Click nodes to see profitability metrics
   - Zoom/pan controls
   - Play/pause/reset controls
   - Route comparison (show multiple paths with different costs)
   - Performance-optimized for 50+ nodes

#### How It Integrates

- **Deployment:** Separate GitHub repository (suggested name: `nostream-ilp-landing` or `nostream-ilp-demo`)
- **Build System:** Independent build pipeline (Vite/Next.js)
- **Dependencies:** No impact on main project dependencies
- **Type Sharing:** May reference TypeScript types from main repo as dev dependency or copy relevant types
- **Documentation:** Links to main project documentation, explains protocol concepts
- **Hosting:** Can be deployed to Vercel, Netlify, GitHub Pages, or similar static hosting

#### Success Criteria

- Users can visualize complete payment flow from client → relay → ILP → settlement
- **Users understand the fee structure and economic incentives for network participation**
- **Fee calculations accurately demonstrate profitability for N-hop routing scenarios**
- Interactive elements allow exploration of different protocol scenarios and routing paths
- Performance remains smooth with 50+ nodes in scaled network view (60fps)
- Mobile-responsive design works on phones, tablets, and desktop
- Visual representation accurately reflects actual protocol implementation and fee structures
- Clear educational value for developers learning both technical and economic aspects
- Professional appearance suitable for marketing/outreach

---

## Stories

### Story 1: React Flow UI Infrastructure Setup
**Estimated Effort:** 2-3 days

- Initialize new React application with React 19
- Configure Vite or Next.js build system
- Install and configure Tailwind CSS 4
- Install shadcn/ui and configure theme
- Set up React Flow with basic configuration
- Create landing page layout shell with:
  - Navigation header
  - Hero section
  - Visualization container areas
  - Footer with links to main project
- Configure TypeScript and linting
- Set up deployment pipeline (Vercel/Netlify)
- Create basic README with setup instructions

### Story 2: Simple Happy Path Flow Visualization with Fee Breakdown
**Estimated Effort:** 3-4 days

- Design simple flow diagram structure:
  - Client node (shows initial payment amount)
  - Nostr event creation
  - Relay node (with payment requirement indicator and relay fee)
  - ILP routing nodes (with connector fees)
  - Settlement ledger (with settlement costs)
  - Confirmation feedback (with total cost summary)
- **Implement fee visualization:**
  - Display fee at each hop as edge labels or node badges
  - Show running total as payment progresses
  - Fee breakdown panel showing:
    - Base relay fee
    - ILP routing fee per hop
    - Settlement costs
    - Total paid vs. total received
- Implement React Flow nodes with custom styling
- Add interactive node tooltips explaining each step **including fee rationale**
- Implement edge animations showing flow progression **with fee accumulation animation**
- Add control panel with:
  - Play button (animate the flow)
  - Pause button
  - Reset button
  - Speed control
  - Toggle fee display on/off
- Add explanatory text panels beside visualization **explaining economic model**
- Ensure mobile responsiveness
- Performance optimization for smooth animations

### Story 3: Scaled Network Graph with Multi-Hop Profitability Visualization
**Estimated Effort:** 5-6 days

- Design complex network topology showing:
  - Multiple user nodes (5-10)
  - Multiple relay nodes (3-5) with different fee structures
  - Payment channel connections with capacities
  - ILP connector network (5+ nodes) with varying fee rates
  - Blockchain settlement layers
- **Implement comprehensive fee/profitability visualization:**
  - **N-hop routing demonstration:**
    - Show multiple possible routes between sender and receiver
    - Display total cost for each route option
    - Highlight optimal route (lowest cost vs. fastest)
    - Animate payment traversing chosen route with fee accumulation
  - **Node profitability metrics:**
    - Display earnings counter for each relay/connector node
    - Show "busy" vs. "idle" nodes based on routing frequency
    - Color-code nodes by profitability (green = profitable, yellow = moderate, red = underutilized)
    - Click node to see detailed profit/loss statement
  - **Route comparison panel:**
    - Side-by-side comparison of 2-3 routing options
    - Show: Number of hops, total fees, estimated time, reliability score
    - Explain tradeoffs (e.g., "3-hop route is cheaper but slower")
  - **Economic incentive demonstration:**
    - Show how intermediary nodes earn fees for facilitating payments
    - Display cumulative earnings over simulation period
    - Illustrate network effect: more traffic = more earnings distributed
- Implement force-directed graph layout algorithm
- Add interactive features:
  - Zoom in/out controls
  - Pan navigation
  - Filter controls (show/hide node types, fee ranges)
  - Highlight active payment paths with fee overlay
  - Click nodes for detailed profitability info
  - Click edges to see fee structure for that connection
- Implement dynamic animations:
  - Event propagation through social graph
  - Payment routing through ILP network **with real-time fee counter**
  - Settlement confirmation flows
  - Periodic "batch" payments showing multiple simultaneous routes
- Performance optimization for 50+ nodes:
  - Virtual rendering if needed
  - Throttled animations
  - Canvas-based rendering for large graphs
  - Debounced fee calculations
- Add scenario selector:
  - "Single payment (simple path)"
  - "Multi-hop payment (compare routes)"
  - "High-traffic network (show profitability over time)"
  - "Route failure and rerouting"
  - "Payment channel lifecycle"
- **Add profitability analytics panel:**
  - Total network fees collected
  - Most profitable nodes
  - Average fees per hop
  - Fee efficiency metrics
- Mobile-responsive with simplified view for small screens (focus on one route at a time)

---

## Compatibility Requirements

✅ **No Impact on Main Project:**

- [x] Existing relay APIs remain unchanged
- [x] No database schema changes required
- [x] No modifications to core relay functionality
- [x] Separate repository and deployment
- [x] Independent build and test pipeline
- [x] Can be updated without affecting main project

---

## Risk Mitigation

### Primary Risks

1. **Scope Creep:** Visualizations becoming overly complex with diminishing educational value
2. **Maintenance Drift:** Visual representation diverging from actual protocol implementation as main project evolves
3. **Performance Issues:** Large graphs causing laggy user experience
4. **Accuracy:** Diagrams not accurately representing protocol behavior

### Mitigation Strategies

- **Scope Control:**
  - Stick to 3 stories maximum
  - Focus on educational value over visual complexity
  - Use story acceptance criteria as hard boundaries
  - Defer "nice-to-have" features to future iterations

- **Maintenance:**
  - Document relationship to main protocol clearly
  - Link to main project documentation as source of truth
  - Consider periodic review (quarterly) to ensure accuracy
  - Version the landing page in sync with major protocol changes

- **Performance:**
  - Set performance budgets: < 1s initial load, 60fps interactions
  - Test with 100 nodes to ensure headroom
  - Use React Flow's built-in optimization features
  - Implement lazy loading for complex visualizations

- **Accuracy:**
  - Review diagrams with protocol implementers
  - Use actual message formats and data structures where possible
  - Include disclaimers that it's a simplified educational view
  - Link to technical documentation for precise details

### Rollback Plan

Since this is a separate repository:
- Archive the repository if needed
- Remove any links from main project documentation
- No impact on core functionality
- Can be resurrected at any time

---

## Definition of Done

### Epic Completion Criteria

- [ ] All 3 stories completed with acceptance criteria met
- [ ] Both simple and scaled visualizations working and performant
- [ ] Interactive elements responsive and intuitive across devices
- [ ] Mobile-responsive design tested on iOS/Android
- [ ] README includes:
  - Setup instructions
  - Build instructions
  - Deployment instructions
  - Link to main project
  - Architecture overview
- [ ] Deployed to production hosting (Vercel/Netlify/etc.)
- [ ] Performance metrics met:
  - Lighthouse score > 90
  - First Contentful Paint < 1.5s
  - 60fps during animations
  - Works smoothly with 50+ nodes
- [ ] Landing page accurately represents actual protocol behavior
- [ ] **Fee calculations validated against actual protocol fee structures**
- [ ] **Profitability metrics demonstrate realistic economic scenarios**
- [ ] No broken links or console errors
- [ ] Accessible (WCAG AA compliance)

---

## Technical Specifications

### Technology Stack

```yaml
framework: React 19
build_tool: Vite (or Next.js for SSG)
styling: Tailwind CSS 4
ui_components: shadcn/ui
visualization: React Flow UI
language: TypeScript
hosting: Vercel / Netlify / GitHub Pages
testing: Vitest + React Testing Library
```

### Repository Structure

```
nostream-ilp-landing/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── flows/           # Flow diagrams
│   │   ├── nodes/           # Custom React Flow nodes
│   │   ├── controls/        # Control panels
│   │   └── analytics/       # Fee/profitability panels
│   ├── data/
│   │   ├── simple-flow.ts   # Simple flow data
│   │   ├── network-graph.ts # Complex network data
│   │   └── fee-structures.ts # Fee models (relay, connector, settlement)
│   ├── lib/
│   │   ├── utils.ts         # Utilities
│   │   ├── fee-calculator.ts # Fee calculation logic
│   │   └── route-optimizer.ts # Route comparison logic
│   └── App.tsx
├── public/
├── docs/
│   └── PROTOCOL.md          # Protocol reference
├── package.json
├── tailwind.config.js
├── components.json          # shadcn config
└── README.md
```

### Key Dependencies

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "latest",
    "class-variance-authority": "latest"
  }
}
```

---

## Deployment Details

### Hosting Options

**Recommended: Vercel**
- Zero-config React deployment
- Automatic preview deployments for PRs
- Edge network for fast loading
- Free tier sufficient for this use case

**Alternative: Netlify**
- Similar to Vercel
- Good CI/CD integration
- Forms/functions available if needed

**Alternative: GitHub Pages**
- Free for public repos
- Good for pure static sites
- Requires build step in CI

### Domain/URL Options

1. Subdomain of main project: `demo.nostream-ilp.com`
2. GitHub Pages: `username.github.io/nostream-ilp-landing`
3. Vercel subdomain: `nostream-ilp-landing.vercel.app`

### CI/CD Pipeline

```yaml
# Example GitHub Actions workflow
name: Deploy Landing Page
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm test
      # Deploy to Vercel/Netlify
```

---

## Story Manager Handoff

**Ready for Story Development**

Please develop detailed user stories for this brownfield epic. Key considerations:

### Context
- **Separate repository deployment** - no impact on main nostream-ilp project
- **Technology stack:** React 19, React Flow UI, shadcn/ui, Tailwind 4, TypeScript
- **Target audience:** Developers learning the protocol, potential users, marketing outreach
- **Protocol to visualize:** Nostr-ILP integration including BTP-NIPs, payment channels, peer discovery

### Integration Points
- May reference TypeScript types from main repo (as dev dependency or copied)
- Links to main project documentation for protocol details
- Separate build/test/deploy pipeline
- No shared runtime dependencies

### Critical Requirements
- **Performance:** Must handle 50+ nodes at 60fps
- **Accuracy:** Visualizations must accurately represent actual protocol **including realistic fee structures**
- **Economic Education:** Must clearly demonstrate profitability for N-hop routing and economic incentives
- **Mobile-responsive:** Must work on all device sizes
- **Educational value:** Focus on clarity over complexity for both technical and economic concepts

### Story Constraints
- Each story must include:
  - Clear acceptance criteria
  - Performance requirements
  - Mobile responsiveness verification
  - Accessibility considerations
- Stories should be sequenced for safe, incremental delivery
- Total epic scope: 3 stories, ~2-3 weeks (accounting for complex fee/profitability visualizations)

### Epic Goal Reminder
The epic should deliver an interactive, educational landing page that demonstrates the Nostr-ILP protocol through both simple happy path and complex network graph visualizations, **with comprehensive fee structure and profitability demonstrations for multi-hop routing**, suitable for developer education, investor outreach, and marketing purposes.

---

## Success Metrics

### User Engagement
- Time on page > 2 minutes (indicates engagement)
- Interaction rate > 70% (users interact with controls)
- Mobile bounce rate < 40%

### Technical Performance
- Lighthouse Performance Score > 90
- First Contentful Paint < 1.5s
- Time to Interactive < 2.5s
- No console errors or warnings

### Educational Value
- Users understand basic protocol flow after viewing
- **Users understand how nodes earn fees and why multi-hop routing is economically sustainable**
- **Users can explain tradeoffs between routing options (cost vs. speed)**
- Clear call-to-action to main documentation
- Low confusion rate (measured via feedback if available)

---

## Future Enhancements (Out of Scope)

These are explicitly NOT included in this epic but could be future work:

- Real-time connection to live relay for actual data and live fee tracking
- **Advanced economic analytics:**
  - Historical profitability trends over time
  - Network-wide economic health dashboard
  - Fee optimization recommendations for node operators
  - What-if scenario builder (adjust fees, see impact on routing)
- **Fee structure customization:**
  - User-adjustable fee sliders to see impact on routing
  - Compare different economic models (flat fees vs. percentage-based)
- Additional visualization modes (event filtering, payment analytics)
- Interactive tutorial/walkthrough mode
- Code examples alongside visualizations
- Protocol simulator (execute mock transactions with real fee calculation)
- Multiple language support (i18n)
- Dark/light theme toggle
- Export diagrams as images/PDFs
- Printable economic model infographics

---

## References

- [React Flow Documentation](https://reactflow.dev/)
- [React Flow UI Components](https://ui.reactflow.dev/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [Interledger Protocol Specification](https://interledger.org/developers/rfcs/)
- Main Project: [nostream-ilp GitHub](https://github.com/yourusername/nostream-ilp)
- Protocol Documentation: `docs/prd/` and `docs/architecture/` in main repo
- **Fee Structure References (for accurate visualization):**
  - BTP-NIPs pricing: `src/btp-nips/pricing.ts` and `src/btp-nips/subscription-pricing.ts`
  - ILP connector fee models: Dassie documentation
  - Payment channel costs: Smart contract gas estimates
  - Settlement layer costs: Blockchain-specific fee documentation

---

**Epic Number:** 10
**Epic Created:** 2025-12-08
**Created By:** Sarah (PO Agent)
**Type:** Brownfield Enhancement
**Deployment:** Separate Repository
**File:** `docs/prd/epic-10-interactive-protocol-visualization.md`
