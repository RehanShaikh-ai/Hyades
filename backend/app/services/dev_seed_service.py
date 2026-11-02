"""Developer-only seed data service for Knowledge Atlas / Hyades.

Generates realistic demonstration workspaces populated with:
- 10-12 substantial notes (500-600 words each of rich technical and domain prose)
- 4-6 sources with chunking
- 3-4 collections organizing notes and sources
- 4-6 conversation threads with interactive message history
- 2-3 flashcard decks with pedagogical cards
- Explicit bidirectional note links
- Complete metadata isolation via `raw_metadata: {"is_demo_seed": True, "seed_batch_id": ...}` and `#seed-demo` tag
- Full idempotency (rerunning does not produce duplicates)
- Safe cleanup mechanism leaving user content completely untouched
"""

import json
import logging
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationError, WorkspaceNotFoundError
from app.models.collection import Collection, CollectionNote, CollectionSource
from app.models.content_chunk import ContentChunk
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.source import Source
from app.models.tag import Tag
from app.models.workspace import Workspace
from app.services import (
    embedding_service,
    graph_index_service,
    note_service,
    vector_service,
)

logger = logging.getLogger("app.services.dev_seed_service")

SEED_BATCH_ID = "demo-seed-v1"
SEED_TAG_NAME = "seed-demo"

# 12 Substantial Notes (each 500-600 words of original, rigorous prose)
NOTE_SPECS: list[dict[str, Any]] = [{'key': 'os_isolation',
  'title': 'Operating System Process Isolation and Virtual Memory',
  'tags': ['systems', 'kernel', 'memory-management', 'security'],
  'content': '# Operating System Process Isolation and Virtual Memory\n'
             '\n'
             'Operating system process isolation represents a foundational principle of contemporary computer '
             'architecture. Without robust boundaries separating running programs, an error or malicious instruction '
             'in one process could corrupt the memory, compromise secrets, or halt the execution of every other '
             'program on the host. Modern hardware-enforced isolation rests primarily on three intertwined mechanisms: '
             'the distinction between kernel and user execution modes, virtual memory address translation mediated by '
             'a Memory Management Unit (MMU), and kernel-level access control tables.\n'
             '\n'
             'At the processor level, modern Central Processing Units operate in privileged rings, typically '
             'designated as Ring 0 (kernel mode) and Ring 3 (user mode). In user mode, the CPU disables direct access '
             'to physical hardware registers, input-output ports, and control registers. Whenever a user program '
             'requires peripheral services—such as disk writes, network transmission, or inter-process '
             'communication—it must issue an explicit system call. This switch triggers a controlled context '
             'transition into Ring 0, where the kernel verifies caller arguments and permissions before executing the '
             'requested hardware operation on behalf of the application.\n'
             '\n'
             'Virtual memory provides every individual process with the illusion of an unbroken, contiguous address '
             'space that is private and dedicated. The physical Random Access Memory, however, is partitioned into '
             'fixed-size frames, commonly four kilobytes in x86-64 architectures. The operating system maintains '
             'hierarchical page tables for every process. The MMU consults these tables to translate every virtual '
             'memory address emitted by the CPU into a concrete physical memory address. Because each process '
             'possesses its own independent page table root pointer—stored in architectural control registers such as '
             'CR3—the identical virtual address in two distinct processes resolves to completely independent physical '
             'frames.\n'
             '\n'
             'Paging enables memory protection flags encoded within each page table entry. Pages can be marked as '
             'read-only, read-write, or non-executable (the NX bit). The non-executable bit prevents arbitrary code '
             'execution inside memory regions reserved for user data or call stacks, neutralizing classical stack '
             'buffer overflow exploits. Furthermore, if a process attempts to read or modify an address that has not '
             'been mapped into its virtual space, the MMU signals a page fault exception. The operating system kernel '
             'intercepts this fault, terminates the errant process with a segmentation violation signal, and ensures '
             'that adjacent workloads continue executing completely undisturbed.\n'
             '\n'
             'Beyond primary memory protection, modern kernels leverage process isolation to implement Copy-On-Write '
             '(COW) semantics during process duplication. When a parent process forks a child, the kernel does not '
             'duplicate memory frames immediately. Instead, it marks existing page entries as read-only and maps them '
             'into both address spaces. Only when either process initiates a write does the MMU trap into the kernel, '
             "which then allocates a clean physical frame, copies the contents, and updates the writer's page entry. "
             'This separation of virtual intent from physical commitment optimizes memory density while maintaining '
             'inviolable isolation guarantees across concurrent system boundaries.\n'
             'In contemporary multi-tenant cloud environments, hardware-enforced process isolation has expanded beyond '
             'traditional single-system kernels through hardware-assisted virtualization extensions (Intel VT-x and '
             'AMD-V). Hypervisors establish an additional privilege domain—often designated as Ring -1 or VMX root '
             'operation—which supervises guest operating systems via Extended Page Tables (EPT) and Nested Page Tables '
             '(NPT). At the OS level, modern container engines combine Linux cgroups v2, user namespaces, and '
             'seccomp-bpf syscall filtering to synthesize lightweight isolated execution sandboxes without hypervisor '
             'virtualization overhead. These complementary technologies ensure that high-density computing clusters '
             'enforce strict memory partitioning, hardware quotas, and privilege boundaries across untrusted '
             'concurrent multi-tenant processes.'},
 {'key': 'osi_model',
  'title': 'The OSI 7-Layer Reference Model and Modern Protocol Stacks',
  'tags': ['networking', 'protocols', 'architecture', 'telecom'],
  'content': '# The OSI 7-Layer Reference Model and Modern Protocol Stacks\n'
             '\n'
             'The Open Systems Interconnection (OSI) reference model, codified by the International Organization for '
             "Standardization in 1984, remains one of computer science's most influential conceptual frameworks. By "
             'dividing network communications into seven modular layers, the model formalizes how disparate computing '
             'equipment, transmission media, and software applications cooperate across interconnected global '
             'networks. While the pragmatic four-layer TCP/IP stack won dominant commercial adoption on the Internet, '
             'the OSI model provides the canonical taxonomy for network diagnostics, architectural design, and '
             'protocol decomposition.\n'
             '\n'
             'Layer 1, the Physical Layer, governs the raw transmission of unstructured bitstreams over hardware '
             'media. It standardizes electrical voltage levels, optical wavelength modulations, radio frequency '
             'frequencies, pin layouts, and mechanical cable specifications. Layer 2, the Data Link Layer, transforms '
             'these raw bit transmissions into discrete frames. Utilizing Media Access Control (MAC) addresses, Layer '
             '2 regulates access to physical shared media through collision avoidance algorithms, performs local frame '
             'synchronization, and executes error detection via cyclic redundancy checks (CRC). Common Layer 2 '
             'standards include Ethernet (IEEE 802.3) and Wi-Fi (IEEE 802.11).\n'
             '\n'
             'Layer 3, the Network Layer, establishes end-to-end logical addressing and dynamic path determination '
             'across heterogeneous intermediate networks. Routers operate at Layer 3, inspecting packet headers to '
             'forward data across autonomous systems using routing protocols like BGP and OSPF. In modern '
             'implementations, Internet Protocol version 4 and version 6 dominate this stratum. Layer 4, the Transport '
             'Layer, provides process-to-process communication, session multiplexing via numerical port numbers, and '
             'transport guarantees. Transmission Control Protocol (TCP) delivers reliable, sequenced, byte-stream '
             'communication with adaptive sliding-window flow control and congestion avoidance, whereas User Datagram '
             'Protocol (UDP) offers lightweight, low-latency, connectionless datagram delivery.\n'
             '\n'
             'The upper strata encompass the Session Layer (Layer 5), Presentation Layer (Layer 6), and Application '
             'Layer (Layer 7). Layer 5 manages dialog control, token administration, and synchronization checkpoints '
             'between remote applications. Layer 6 resolves data syntax and formatting discrepancies, handling '
             'character conversions, cryptographic ciphering (such as TLS encryption), and binary compression. Layer 7 '
             'directly interacts with end-user software applications, implementing application protocols including '
             'HTTP/3, SSH, DNS, and SMTP.\n'
             '\n'
             'In contemporary production systems, the rigid boundaries of the upper three layers frequently coalesce '
             'into application runtimes and unified library layers. For example, modern web browsers handle '
             'presentation formatting (JSON, UTF-8), cryptographic negotiation (TLS 1.3), and session persistence '
             'within unified application routines. Nevertheless, the OSI encapsulation principle remains absolute: '
             'outgoing data travels downward through the stack, with each lower layer prepending its own protocol '
             'header to create a new Protocol Data Unit (PDU). Upon arrival at the receiving host, data traverses '
             'upward, where successive headers are verified and stripped. This modular decoupling ensures that '
             'lower-tier transport and physical upgrades, such as transitioning from fiber optics to millimeter-wave '
             'wireless, require zero modifications to user-facing applications.\n'
             'In modern enterprise architectures and software-defined wide area networks, the classic OSI layering is '
             'further augmented by encapsulation overlay protocols. Technologies such as Virtual Local Area Network '
             '(VLAN) tagging under IEEE 802.1Q and Virtual Extensible LAN (VXLAN) encapsulate complete Layer 2 '
             'Ethernet frames directly inside Layer 4 UDP packets, constructing scalable multi-tenant overlay networks '
             'across disparate physical data centers. Furthermore, emerging transport protocols like HTTP/3 redefine '
             'conventional boundaries by integrating cryptographic key exchange and streams-based multiplexing into '
             'the user-space QUIC transport protocol over UDP, entirely bypassing operating system kernel TCP state '
             'machines to eliminate head-of-line blocking and achieve single-round-trip connection migrations.'},
 {'key': 'ml_evaluation',
  'title': 'Machine Learning Evaluation: Metrics, Validation and Data Leakage',
  'tags': ['machine-learning', 'statistics', 'data-science', 'evaluation'],
  'content': '# Machine Learning Evaluation: Metrics, Validation and Data Leakage\n'
             '\n'
             'Evaluating machine learning systems requires empirical rigor that extends far beyond measuring raw '
             'training accuracy. A predictive model that demonstrates flawless performance on observed training '
             'samples often fails catastrophically when deployed into production environments. Reliable assessment '
             'hinges on deliberate evaluation design: selecting domain-appropriate statistical metrics, enforcing '
             'strict train-validation-test separation, applying stratified cross-validation strategies, and vigilantly '
             'guarding against covert data leakage.\n'
             '\n'
             'Statistical evaluation begins with metric selection aligned to operational consequences. In '
             'classification tasks with severe class imbalance—such as medical screening, fraud detection, or network '
             'intrusion monitoring—accuracy is fundamentally deceptive. If negative cases constitute ninety-nine '
             'percent of samples, a naive classifier that universally predicts the negative label achieves ninety-nine '
             'percent accuracy while offering zero practical utility. Practitioners therefore utilize Precision, '
             'Recall, and the harmonic F1-Score. Precision quantifies the ratio of true positive outcomes among all '
             "positive predictions, directly reflecting false-alarm penalties. Recall measures the model's ability to "
             'uncover actual positive instances in the population. The Receiver Operating Characteristic curve and '
             'Area Under the Curve (ROC-AUC) further characterize classification thresholds across varying cost '
             'tolerances.\n'
             '\n'
             'Validation methodologies prevent overfitting to arbitrary data partitions. In standard k-fold '
             'cross-validation, the dataset is divided into k disjoint subsets. The model trains iteratively on k '
             'minus one folds and evaluates on the withheld holdout fold, producing an aggregate metric distribution '
             'that reflects stability across diverse sample draws. For time-series datasets, however, standard k-fold '
             'cross-validation introduces temporal leakage. Models cannot evaluate on past events using models trained '
             'on future states; practitioners must instead implement forward-chaining rolling-window validation that '
             'strictly respects chronological ordering.\n'
             '\n'
             'Data leakage represents one of the most subtle yet catastrophic failure modes in applied predictive '
             'modeling. Leakage occurs whenever information from outside the training partition inadvertently '
             'influences feature construction, model optimization, or hyperparameter selection. Common sources include '
             'performing global feature scaling, missing value imputation, or target encoding across the entire '
             'dataset prior to splitting. When preprocessing transformers fit statistics using full-population data, '
             'test set distribution characteristics leak directly into training weights, producing unrealistically '
             'optimistic validation benchmarks.\n'
             '\n'
             'To eradicate leakage, all transformation pipelines must adhere to strict scikit-learn or similar '
             'pipeline abstractions where transformers fit exclusively on training slices and merely transform '
             'evaluation slices. Furthermore, feature engineering must be audited to ensure that retrospective or '
             'downstream variables—such as post-transaction customer support resolutions in credit risk scoring—are '
             'excluded from prediction matrices. By combining cross-validation routines, leak-free feature pipelines, '
             'and confidence-interval estimation, engineering teams ensure that offline evaluation accurately predicts '
             'online deployment efficacy.\n'
             'Beyond discrete classification metrics, production machine learning systems require rigorous probability '
             'calibration assessment. A classifier predicting an eighty percent confidence score must exhibit an '
             'empirical accuracy of eighty percent across that confidence bucket; practitioners verify this '
             'calibration using Brier scores, reliability diagrams, and Platt scaling or isotonic regression '
             'adjustments. Furthermore, models operating in non-stationary environments experience concept drift and '
             'covariate shift, where data distributions evolve over time. Robust monitoring infrastructures compute '
             'continuous drift statistics—such as the Population Stability Index (PSI) and Kolmogorov-Smirnov test '
             'statistics—to detect performance decay, trigger automated retraining workflows, and preserve '
             'generalization integrity against real-world domain shifts.'},
 {'key': 'vector_embeddings',
  'title': 'Vector Embeddings and Approximate Nearest Neighbor Search',
  'tags': ['vector-search', 'embeddings', 'ai', 'hnsw', 'algorithms'],
  'content': '# Vector Embeddings and Approximate Nearest Neighbor Search\n'
             '\n'
             'Vector embeddings form the computational foundation of modern semantic search, recommendation engines, '
             'and neural information retrieval. Traditional lexical retrieval systems, such as BM25 and TF-IDF, rely '
             'on inverted indices that match explicit token frequencies. While fast and precise for exact keyword '
             'lookups, lexical indices fail when queries and documents use synonyms, paraphrasing, or distinct '
             'vocabularies. Vector embeddings bridge this semantic gap by mapping discrete symbols—such as textual '
             'sentences, audio fragments, or visual images—into continuous, high-dimensional vector spaces where '
             'geometric proximity signifies conceptual relatedness.\n'
             '\n'
             'Dense representation models, including Transformer encoders like BERT and dual-encoder architectures, '
             'project unstructured text into dense floating-point arrays typically spanning 384 to 1536 dimensions. '
             'During model training via contrastive objectives (such as InfoNCE), the encoder is optimized so that '
             'semantically similar passage pairs minimize cosine distance, while unrelated passages are pushed toward '
             "orthogonal or divergent orientations. Consequently, searching for the concept of 'cardiovascular "
             "therapy' naturally surfaces passages discussing 'myocardial infarction treatments' even in the total "
             'absence of shared words.\n'
             '\n'
             'However, searching over collections containing millions of dense vectors introduces severe computational '
             'complexity. An exact k-Nearest Neighbors (k-NN) linear scan requires calculating vector dot products '
             'against every single indexed item, scaling with O(N * D) complexity where N is document count and D is '
             'dimensionality. For latency-critical interactive applications requiring sub-fifty-millisecond response '
             'times, exhaustive linear calculation is computationally intractable. Systems resolve this bottleneck '
             'through Approximate Nearest Neighbor (ANN) search algorithms that sacrifice marginal precision in '
             'exchange for logarithmic query velocity.\n'
             '\n'
             'Among contemporary ANN algorithms, Hierarchical Navigable Small World (HNSW) graphs have emerged as the '
             'industry benchmark for dense indexing. HNSW constructs a multi-layer geometric graph structure analogous '
             'to a skip-list. The uppermost layers contain sparse subgraphs with extended edge lengths, facilitating '
             'rapid long-distance graph traversal across the semantic universe. As the search algorithm navigates '
             'closer to the query vector, it steps down to progressively denser graph layers with shorter '
             'interconnecting edges, refining the local neighborhood search until reaching candidate convergence.\n'
             '\n'
             'Vector databases, such as Qdrant, Milvus, and pgvector, augment ANN graph structures with scalar '
             'metadata filtering and inverted payload indexing. This hybrid capability allows queries to constrain '
             'searches simultaneously by geometric vector similarity and boolean metadata predicates—such as user '
             'tenancy, workspace boundaries, or publication dates. By combining dense representations with scalable '
             'graph traversal and deterministic metadata filters, vector systems provide the cognitive substrate '
             'powering intelligent knowledge synthesis across large enterprise repositories.\n'
             'To achieve high-throughput scale across billions of vector points, modern retrieval infrastructures '
             'utilize sophisticated vector compression algorithms alongside graph indexing. Product Quantization (PQ) '
             'and Scalar Quantization (SQ8) compress 32-bit floating-point coordinates into 8-bit integers or discrete '
             'codebook indices, diminishing memory footprints by up to ninety-five percent with negligible recall '
             'degradation. Inverted File Indexing with Product Quantization (IVF-PQ) partitions the vector space into '
             'Voronoi cells, restricting similarity searches to centroids proximate to the query vector. These '
             'quantization techniques, coupled with SIMD-accelerated distance kernels (AVX-512 and ARM Neon), enable '
             'millisecond-level similarity computations across massive enterprise corpora while preserving high recall '
             'accuracy.'},
 {'key': 'rag_architecture',
  'title': 'Retrieval-Augmented Generation: Architecture and Grounding',
  'tags': ['rag', 'llm', 'search', 'information-retrieval', 'ai'],
  'content': '# Retrieval-Augmented Generation: Architecture and Grounding\n'
             '\n'
             'Retrieval-Augmented Generation (RAG) has established itself as the leading architectural pattern for '
             'grounding Large Language Models (LLMs) in proprietary, dynamic, and verifiable knowledge. While modern '
             'foundation models exhibit impressive linguistic fluency and broad commonsense reasoning, their '
             'parametric memory suffers from critical vulnerabilities: knowledge cutoffs prevent awareness of recent '
             'developments, internal weights hallucinate non-existent citations when uncertain, and enterprise private '
             'documents cannot be inspected without expensive retraining. RAG resolves these defects by decoupling '
             'memory storage from linguistic reasoning.\n'
             '\n'
             'The canonical RAG architecture operates across two synchronized pipelines: an offline indexing pipeline '
             'and an online inference pipeline. During indexing, source artifacts—including technical documentation, '
             'research papers, and meeting notes—undergo structural parsing and chunking. Because standard embedding '
             'models have finite token context windows and dense vectors lose specificity when summarizing extensive '
             'texts, long documents are partitioned into semantic chunks, typically between 256 and 512 tokens with '
             'overlapping boundaries. These chunks are embedded into dense vectors and indexed alongside rich metadata '
             'in a vector database.\n'
             '\n'
             'When an end-user submits a query during online inference, the system first executes a semantic retrieval '
             'step. The user prompt is converted into a query vector, which probes the vector index to retrieve the '
             'top-k most relevant text chunks. Leading RAG pipelines implement hybrid search, combining dense vector '
             'similarity with sparse lexical scoring (such as BM25). Dense search captures thematic synonyms and '
             'conceptual relevance, while lexical search preserves exact matches for acronyms, specific product model '
             'numbers, and rare identifiers.\n'
             '\n'
             'Following preliminary retrieval, modern architectures pass the candidate chunks into a cross-encoder '
             'reranking model. While bi-encoders produce static embeddings independently for fast ANN lookup, '
             'cross-encoders process the query and candidate chunk jointly through multi-layer attention, capturing '
             'intricate token-level dependencies. The reranker re-orders candidates and discards low-scoring '
             'distractors, drastically improving retrieval precision.\n'
             '\n'
             'The filtered chunks are subsequently injected into the system prompt alongside the original user query, '
             'instructing the LLM to synthesize an answer derived strictly from the provided context citations. This '
             'structured prompt grounding converts an unconstrained generative task into an open-book reading '
             'comprehension task. By enforcing explicit citation mapping from generated sentences back to specific '
             'chunk identifiers, the system empowers users to audit factual accuracy, eliminates generative '
             'hallucinations, and guarantees verifiable provenance across enterprise knowledge corpora.\n'
             'Advanced enterprise RAG implementations incorporate iterative query transformations and multi-document '
             'contextual synthesis before prompting generative foundation models. Techniques such as Hypothetical '
             'Document Embeddings (HyDE) generate a preliminary synthetic response using an instruction-tuned LLM, '
             'utilizing the embedding of that synthetic text—rather than the raw, terse user query—to probe vector '
             'storage for content with matching semantic density. Furthermore, Hierarchical GraphRAG frameworks '
             'extract entity-relationship knowledge graphs during indexing, enabling systems to execute hybrid '
             'traversals that unify dense unstructured text chunks with structured knowledge graphs. This contextual '
             'fusion empowers models to answer complex, multi-hop thematic questions that span hundreds of disparate '
             'documents without contextual omission. In addition, automated RAG evaluation frameworks—such as Ragas '
             'and TruLens—compute quantitative metrics for faithfulness, answer relevance, and context recall using '
             'LLM-as-a-judge methodologies, enabling continuous regression monitoring across vector pipeline '
             'modifications.'},
 {'key': 'offline_first',
  'title': 'Offline-First Architecture: Local Storage and State Synchronization',
  'tags': ['offline-first', 'sync', 'distributed-systems', 'frontend', 'architecture'],
  'content': '# Offline-First Architecture: Local Storage and State Synchronization\n'
             '\n'
             'Offline-first architecture represents a paradigm shift in web and mobile application engineering, '
             'treating network connectivity as an intermittent enhancement rather than an absolute runtime '
             'prerequisite. Traditional thin-client architectures delegate all authoritative state mutations to remote '
             'centralized servers, blocking user interactions with network spinners and failing entirely when '
             'connections degrade. In contrast, offline-first systems position the local client device as an '
             'authoritative, self-sufficient data store that persists changes locally and synchronizes bidirectionally '
             'with remote peers whenever network connectivity is established.\n'
             '\n'
             'Implementing an offline-first client begins with local persistence engines capable of structured '
             'querying and transactional durability. On modern web browsers, IndexedDB serves as the primary local '
             'storage layer, providing asynchronous object-store persistence capable of holding hundreds of megabytes '
             'of client data. Applications build abstracted local database layers atop IndexedDB—such as Dexie, SQLite '
             'via WebAssembly (Wasm), or PGlite—allowing user interfaces to perform reads, writes, and full-text '
             'searches with zero network latency.\n'
             '\n'
             'The fundamental engineering challenge in offline-first systems is data synchronization and state '
             'divergence. When multiple clients modify the same conceptual document while disconnected from one '
             'another, their local states inevitably branch. Simple timestamp-based strategies, such as '
             'Last-Write-Wins (LWW), are notoriously prone to silent data destruction: clock skew between mobile '
             'devices can cause an older edit to overwrite a newer one, or concurrent additions to an array can '
             'overwrite preceding elements.\n'
             '\n'
             'Robust offline synchronization frameworks employ delta-based synchronization protocols paired with '
             'persistent mutation outboxes. Whenever a user edits a record, the application transactionally records '
             'both the optimistic state mutation in local tables and an immutable mutation intent in an outgoing '
             "synchronization queue. When the client's network layer detects an active connection, an orchestration "
             'worker consumes the outbox, transmitting ordered deltas to the central synchronizer.\n'
             '\n'
             'Furthermore, synchronization engines must incorporate reliable idempotency keys and server '
             'reconciliation protocols. If a network interruption severs an HTTP connection after the server commits a '
             'mutation but before the client receives the acknowledgment, the client will inevitably retry the '
             'transmission. Unique cryptographic idempotency keys ensure the server deduplicates retransmitted '
             'payloads without generating redundant records. By decoupling the interactive user interface loop from '
             'asynchronous transport layers, offline-first architectures deliver instantaneous UI responsiveness, '
             'eliminate connectivity vulnerabilities, and guarantee data resilience in mobile and edge environments.\n'
             'To manage the user experience during network disconnection, sophisticated offline-first architectures '
             'implement optimistic UI rendering coupled with automatic rollback mechanics. When a user executes a '
             'destructive or stateful action, the interface immediately renders the anticipated success state while '
             'appending the corresponding mutation delta to an immutable, prioritized background queue. If subsequent '
             'server-side validation or business logic rejects the operation upon network reconnection, the '
             'application initiates a compensating transaction that cleanly reverts the optimistic local state, '
             'displaying clear, non-intrusive notification banners to the user. By combining Service Workers, local '
             'IndexedDB caches, and background sync workers, client applications deliver resilient, continuous '
             'productivity regardless of atmospheric or cellular interference. Furthermore, by compiling embeddable '
             'search engines like SQLite with FTS5 or MiniSearch into client-side WebAssembly bundles, applications '
             'execute sub-millisecond lexical and prefix searches directly against local indexed tables with zero '
             'network dependency.'},
 {'key': 'crdt_systems',
  'title': 'Conflict-Free Replicated Data Types (CRDTs) in Distributed Systems',
  'tags': ['crdts', 'distributed-systems', 'concurrency', 'algorithms'],
  'content': '# Conflict-Free Replicated Data Types (CRDTs) in Distributed Systems\n'
             '\n'
             'Conflict-Free Replicated Data Types (CRDTs), pioneered by Marc Shapiro, Nuno Preguiça, and their '
             'collaborators in 2011, provide mathematical foundations for seamless data replication across distributed '
             'nodes without centralized coordination. In distributed environments—such as collaborative document '
             'editors, decentralized peer-to-peer networks, and multi-region database clusters—concurrent '
             'modifications frequently occur while nodes are partitioned. CRDTs guarantee Strong Eventual Consistency '
             '(SEC): whenever any two replicas have received the same set of updates, regardless of the order or '
             'network routing paths those updates took, their internal states are guaranteed to converge identically.\n'
             '\n'
             'CRDTs are categorized into two primary theoretical formulations: Operation-based (Op-based) and '
             'State-based (CvRDT). State-based CRDTs transmit their complete internal state to peer replicas during '
             'synchronization. Replicas merge incoming states using a mathematically defined merge operator. For '
             'convergence to be mathematically guaranteed, the merge operator must form a bounded semilattice, '
             'exhibiting three core algebraic properties: associativity (grouping does not affect outcome), '
             'commutativity (order of operands does not affect outcome), and idempotence (merging identical states '
             'yields the same state). Because of idempotence, state-based CRDTs easily tolerate duplicate message '
             'delivery and out-of-order packet arrival.\n'
             '\n'
             'Operation-based CRDTs, conversely, transmit discrete mutation operations rather than full states. These '
             'systems require the underlying messaging fabric to guarantee reliable, causal delivery of operations. '
             'Upon receiving an operation, each replica executes the mutation against its local state. Because '
             'operations are designed to commute with concurrent operations, all replicas reach identical '
             'configurations once all messages arrive.\n'
             '\n'
             'In collaborative text editing and rich-text note taking, sequence CRDTs—such as RGA, Logoot, LSEQ, and '
             'modern implementations like Yjs and Automerge—represent character streams as ordered sequences of '
             'uniquely identified atoms. When a user inserts a character between existing characters, the CRDT assigns '
             'the new element a fractional, immutable identifier that sits strictly between the left and right '
             'neighbor identifiers. If two users concurrently type characters at the exact same cursor position, '
             'deterministic tie-breaking rules (typically using unique replica IDs and Lamport timestamps) order the '
             'characters identically across all connected clients.\n'
             '\n'
             'Modern production CRDT libraries have achieved extraordinary efficiency, leveraging run-length encoding '
             'and compact columnar arrays to reduce memory overhead and achieve microsecond-level merge latencies. By '
             'replacing complex centralized locking protocols with decentralized algebraic convergence, CRDTs empower '
             'developers to construct real-time collaborative applications that function flawlessly offline, merge '
             'seamlessly upon reconnection, and scale without centralized lock contention bottlenecks.\n'
             "A major historical challenge in sequence CRDTs was the accumulation of deletion markers ('tombstones'), "
             'which retained metadata for deleted characters to maintain fractional coordinate topology, causing '
             'significant memory bloat over time. Modern sequence CRDT implementations address this through '
             'state-pruning algorithms and garbage collection protocols that safely compact tombstones once all '
             'connected replicas have acknowledged a common causal synchronization barrier. Furthermore, rich-text '
             'CRDT architectures, such as the Peritext algorithm and Yjs formatting spans, cleanly decouple character '
             'sequence replication from formatting intervals (e.g., bolding, hyperlinks), ensuring that overlapping '
             'concurrent formatting operations merge cleanly without tearing text intervals or corrupting structural '
             'markup. Delta-based CRDT formulations further optimize network bandwidth: rather than transmitting full '
             'states, replicas exchange concise delta states representing recent mutations, maintaining algebraic '
             'convergence guarantees while achieving minimal wire payloads in mobile and IoT topologies.'},
 {'key': 'spaced_repetition',
  'title': 'Cognitive Science of Spaced Repetition and Testing Effects',
  'tags': ['cognitive-science', 'learning', 'spaced-repetition', 'memory'],
  'content': '# Cognitive Science of Spaced Repetition and Testing Effects\n'
             '\n'
             'The empirical study of human memory over the past century has revealed a profound disconnect between '
             'intuitive study habits and biologically optimal learning strategies. While learners overwhelmingly favor '
             "massed practice ('cramming') and passive rereading due to their low immediate cognitive friction, "
             'cognitive psychology demonstrates that these methods produce fragile, short-lived retention. In stark '
             'contrast, two robust phenomena—the Spacing Effect and the Testing Effect (retrieval practice)—form the '
             'scientific bedrock for long-term memory consolidation and efficient conceptual mastery.\n'
             '\n'
             'The spacing effect, first methodically quantified by Hermann Ebbinghaus in 1885, describes how learning '
             'trials distributed over temporal intervals yield vastly superior retention compared to identical trials '
             "massed together in time. Ebbinghaus charted the 'forgetting curve,' demonstrating that memory decay "
             'follows an exponential decay function where the steepest loss occurs immediately following initial '
             'acquisition. However, each successful memory retrieval that occurs just before an item lapses into '
             'oblivion flattens the subsequent decay trajectory, dramatically extending the interval before the next '
             'review is required.\n'
             '\n'
             "Modern computerized spaced repetition algorithms—most notably the SuperMemo SM-2 algorithm, Anki's "
             'modified schedulers, and modern Bayesian models like FSRS (Free Spaced Repetition '
             "Scheduler)—operationalize this dynamic. These algorithms model an item's memory trace using parameters "
             'such as retrievability (the current probability of successful recall), stability (the time required for '
             'retrievability to drop from 100% to 90%), and difficulty. By dynamically computing interval expansions '
             'based on user recall grades, spaced repetition software minimizes total cumulative study time while '
             'maintaining overall retention targets of ninety percent or higher.\n'
             '\n'
             'Complementing spacing is the testing effect, validated extensively by cognitive psychologists Roediger '
             'and Karpicke. Testing is conventionally viewed as an assessment tool to evaluate existing knowledge. '
             'However, cognitive science establishes that the act of memory retrieval is itself an active '
             'memory-modifying event. When an individual struggles to retrieve a concept from long-term memory, the '
             'brain activates associative neural pathways, reconstructs conceptual schemas, and strengthens synaptic '
             'connectivity far more effectively than passive rereading ever could.\n'
             '\n'
             "Furthermore, Robert Bjork's framework of 'Desirable Difficulties' elucidates why spaced retrieval feels "
             'counter-intuitively challenging. When information is retrieved effortlessly—such as immediately after '
             'reviewing a textbook summary—the retrieval induces minimal memory consolidation. When retrieval requires '
             'effortful cognitive reconstruction after a deliberate delay, the brain interprets the memory trace as '
             'vital, triggering neurobiological consolidation processes. Integrating active recall flashcards, '
             'self-explanation prompts, and spaced intervals into knowledge management systems transforms static notes '
             'into active cognitive gymnasiums, ensuring sustained mastery of complex technical domains.\n'
             'To maximize cognitive efficiency, evidence-based learning systems also integrate the principle of '
             'Interleaving alongside spaced intervals. Rather than massing practice on a single isolated concept or '
             'problem type (blocked practice), interleaving deliberately alternates between related but distinct '
             'problem categories within a single study session. While interleaving increases short-term cognitive '
             'friction and error rates during practice, it compels the brain to continually discern subtle structural '
             'differences between concepts, fostering superior conceptual discrimination and flexible real-world '
             'transfer. Paired with atomic flashcard authoring—where each card encodes a single, indivisible '
             'concept—spaced retrieval systems systematically prevent cognitive interference, ensuring rapid recall '
             'and enduring intellectual comprehension.'},
 {'key': 'deliberate_practice',
  'title': 'Deliberate Practice, Mental Models and Skill Acquisition',
  'tags': ['expertise', 'psychology', 'skill-acquisition', 'learning'],
  'content': '# Deliberate Practice, Mental Models and Skill Acquisition\n'
             '\n'
             'The nature of exceptional human performance has long been shrouded in myths of innate talent and '
             'effortless genius. However, decades of pioneering empirical research by psychologist K. Anders Ericsson '
             'and his contemporaries demonstrate that expertise across domains—ranging from chess mastery and violin '
             'performance to complex software engineering—is primarily forged through thousands of hours of structured '
             "'deliberate practice.' Deliberate practice is not mere repetition; it is an intensely focused, "
             'goal-directed activity engineered to systematically stretch the boundaries of current capability.\n'
             '\n'
             'Ericsson distinguished deliberate practice from routine execution and play. Most individuals in '
             'professional careers reach an acceptable level of functional competence within a few years, after which '
             'automated habits take over and performance plateaus. Deliberate practice counteracts this premature '
             'automation by isolating specific micro-components of performance that fall just beyond the '
             "practitioner's comfort zone—the 'proximal zone of development.' A software engineer practicing "
             'deliberate practice does not simply write familiar boilerplate code; they deliberately implement a '
             'concurrent lock-free queue, analyze boundary edge cases, and subject their solution to property-based '
             'fuzz testing.\n'
             '\n'
             'Central to deliberate practice is immediate, informative feedback. Without immediate feedback, an '
             'individual cannot distinguish between effective strategies and flawed misconceptions, causing bad habits '
             'to become deeply entrenched. Expert performers rely on experienced mentors, rigorous automated test '
             'suites, or objective metrics to pinpoint exact errors in real time. Following feedback, the practitioner '
             'engages in iterative refinement, repeating the challenging segment with conscious corrective adjustments '
             'until the error is eliminated.\n'
             '\n'
             'Over thousands of hours of deliberate practice, the human brain undergoes substantial neurostructural '
             "adaptations, constructing sophisticated 'mental representations' or cognitive schemas. As demonstrated "
             'in classic studies of chess grandmasters by Chase and Simon, experts do not possess superior general '
             'memory or raw processing speed. Instead, they organize domain knowledge into rich, hierarchical '
             "'chunks.' When an expert software architect inspects a distributed system topology, they do not perceive "
             'twenty isolated server boxes; they immediately perceive high-level architectural patterns—such as '
             'write-ahead logs, leader-follower consensus groups, and cache-aside tiers—allowing them to rapidly '
             'anticipate failure modes that novices cannot fathom.\n'
             '\n'
             'Crucially, deliberate practice requires continuous cognitive effort and cannot be sustained '
             'indefinitely; studies indicate that three to four hours per day represents the sustainable human limit '
             'before cognitive fatigue degrades practice quality. Knowledge management systems facilitate deliberate '
             'practice by organizing concepts into structured learning paths, promoting self-testing mechanisms, and '
             'documenting evolving mental models through reflective notes and architectural decision records.\n'
             'In educational and cognitive psychology, deliberate practice is underpinned by the three-phase '
             'Self-Regulated Learning cycle formulated by Barry Zimmerman: the forethought phase (setting specific, '
             'task-oriented performance goals and strategic plans), the performance phase (maintaining metacognitive '
             'monitoring and focused attention during execution), and the self-reflection phase (evaluating outcomes '
             'against objective criteria and attributing errors to strategic choices rather than fixed traits). '
             'Furthermore, Cognitive Load Theory illustrates that deliberate practice must carefully manage working '
             'memory limitations: instruction must eliminate extraneous cognitive load (poor documentation or '
             'confusing interfaces) so that maximal cognitive capacity is dedicated to germane load—the mental effort '
             'required to construct and integrate sophisticated schemas into long-term memory.'},
 {'key': 'software_verification',
  'title': 'Automated Software Verification: Property-Based and Integration Testing',
  'tags': ['testing', 'software-engineering', 'quality-assurance', 'verification'],
  'content': '# Automated Software Verification: Property-Based and Integration Testing\n'
             '\n'
             'Software testing is often colloquially reduced to writing standard unit tests with hardcoded example '
             'inputs and expected outputs. While example-based unit tests are vital for verifying basic happy-path '
             'functionality and preventing regressions, they suffer from a fundamental limitation: they only test the '
             'specific scenarios that the developer possessed the foresight to imagine. In complex distributed '
             'systems, stateful state machines, and concurrency primitives, critical vulnerabilities almost always '
             'lurk in unanticipated edge cases, extreme boundary values, and interleaved sequences of operations. '
             'Automated software verification overcomes this limitation through property-based testing and hermetic '
             'integration testing.\n'
             '\n'
             'Property-based testing (PBT), popularized by John Hughes and Koen Claessen through QuickCheck in Haskell '
             'and adopted across modern languages via libraries like Hypothesis (Python) and fast-check (TypeScript), '
             "inverts the testing paradigm. Instead of verifying that 'function f with input (2, 3) yields 5', the "
             'engineer specifies universal mathematical invariants—properties that must hold true across all possible '
             'valid inputs. For example, when verifying a serialization parser, the round-trip property dictates that '
             'for any arbitrary document x, deserializing the serialized representation of x must equal x exactly.\n'
             '\n'
             'When executed, a property-based testing framework generates hundreds or thousands of pseudo-randomized '
             'inputs, systematically probing boundary conditions such as empty strings, null bytes, negative '
             'infinities, and deeply nested structures. Crucially, when the framework uncovers an input that violates '
             "the specified invariant, it executes automated 'shrinking.' The framework systematically simplifies the "
             'failing counter-example—reducing an 800-character corrupted payload down to a minimal two-byte '
             'string—presenting the developer with the exact, minimal root-cause reproduction case.\n'
             '\n'
             'Complementing property-based testing are hermetic integration test suites. While unit tests verify '
             'components in isolation using mocks and stubs, mocks frequently encode optimistic assumptions that do '
             'not reflect production realities. A mocked database query might succeed in a unit test while failing '
             'catastrophically in production due to foreign-key constraint violations or transactional isolation '
             'locks. Hermetic integration tests spin up real, disposable dependencies—such as ephemeral PostgreSQL '
             'instances, Qdrant vector databases, and Redis caches inside Docker containers—verifying real-world '
             'network boundaries, schema migrations, and concurrency locks under realistic operating conditions.\n'
             '\n'
             'By combining property-based invariant verification for algorithmic components with containerized '
             'integration suites for system boundaries, engineering teams establish high-confidence quality gates. '
             'Automated verification transforms software reliability from an art of subjective developer confidence '
             'into a measurable discipline of rigorous mathematical guarantees.\n'
             'Beyond standard randomized property-based testing, advanced software verification incorporates stateful '
             'model-based testing and automated mutation analysis. Stateful model-based testing generates randomized '
             'sequences of parallel and sequential API calls against a stateful system, verifying that the '
             'implementation matches the state transitions of a simplified mathematical reference model at every step. '
             'This technique routinely uncovers subtle race conditions, distributed deadlocks, and corrupted database '
             'invariants that evade manual test suites. Additionally, mutation testing tools evaluate test suite '
             'quality by injecting subtle synthetic bugs (mutants)—such as negating boolean conditions or altering '
             'arithmetic operators—and verifying that existing tests detect and kill every mutant, ensuring that test '
             'suites provide genuine verification rather than hollow code-coverage statistics. Complementing model '
             'testing, coverage-guided fuzzing engines (such as AFL++ and libFuzzer) synthesize millions of malformed '
             'byte payloads, systematically exploring untested branches and detecting memory safety violations, '
             'arithmetic overflows, and unhandled exception panics.'},
 {'key': 'gothic_architecture',
  'title': 'Structural Engineering of Gothic Cathedrals and Ribbed Vaulting',
  'tags': ['architecture', 'history', 'structural-engineering', 'masonry'],
  'content': '# Structural Engineering of Gothic Cathedrals and Ribbed Vaulting\n'
             '\n'
             'The transition from Romanesque to Gothic architecture in twelfth-century Europe represents one of the '
             'most astonishing leaps in the history of structural engineering. Romanesque churches were defined by '
             'massive stone walls, squat proportions, and small window apertures because the semicircular barrel '
             'vaults they supported exerted colossal outward lateral thrusts that threatened wall stability. The '
             'master masons of the High Middle Ages revolutionized building mechanics through a trifecta of '
             'interdependent structural innovations: the pointed arch, the ribbed groin vault, and the external flying '
             'buttress.\n'
             '\n'
             'The mechanical brilliance of the pointed arch lies in vector force resolution. Semicircular arches '
             'generate significant horizontal thrust vectors along their spring lines, pushing stone walls outward and '
             'requiring massive masonry bulk to counteract overturning moments. By adjusting the centers of curvature, '
             'the pointed arch channels the primary gravitational thrust vector far more vertically into supporting '
             'piers, substantially diminishing the destructive lateral component. Furthermore, pointed arches '
             'liberated builders from the geometric rigidity of Romanesque vaulting, allowing master masons to vault '
             'rectangular and irregular structural bays to uniform crown heights.\n'
             '\n'
             'The ribbed groin vault built upon this geometric freedom by decoupling structural load-bearing skeletons '
             'from non-structural infill webbing. In traditional groin vaults, the entire masonry surface served as an '
             'undifferentiated, heavy load-bearing shell. In Gothic ribbed vaulting, diagonal, transverse, and '
             'longitudinal stone ribs form an articulated framework of skeletal arches. These skeletal ribs '
             'concentrate the compressive weight of the ceiling directly downward into specific, discrete piers. The '
             'webbing between the ribs functions as a lightweight masonry shell, significantly diminishing dead load '
             'and structural vulnerability to settling.\n'
             '\n'
             'However, vaulting monumental naves to unprecedented heights—such as Amiens Cathedral at forty-two meters '
             'and Beauvais Cathedral at forty-eight meters—generated residual lateral thrusts that vertical interior '
             'piers alone could not safely resist. To resolve this, Gothic architects engineered the flying buttress: '
             'an exterior masonry arch that springs from an outer buttress pier to meet the high nave wall at the '
             'exact point of concentrated vault thrust. The flying buttress collects horizontal forces high above the '
             'side aisles and transfers them safely downward to ground-level foundations far outside the church '
             'footprint.\n'
             '\n'
             'By relocating the load-bearing skeleton to discrete piers and exterior buttressing systems, the exterior '
             'curtain walls were entirely relieved of structural duties. Master masons replaced heavy stone walls with '
             "luminous expanses of stained glass, culminating in the transcendent 'lux nova' of Sainte-Chapelle in "
             'Paris. Gothic engineering demonstrated that monumental architectural grandeur could be achieved through '
             'skeletal force optimization rather than sheer material mass.\n'
             'A critical yet frequently overlooked element of Gothic structural engineering is the pinnacle: the '
             'ornamental stone spire placed atop the exterior buttress piers. Far from being purely decorative, '
             'pinnacles perform a vital mechanical function by adding heavy vertical dead weight directly onto the '
             'outer buttress piers. According to the laws of static equilibrium, adding vertical compressive force '
             'rotates the resultant vector of the diagonal flying buttress thrust downward, keeping the line of thrust '
             'comfortably within the middle third of the pier masonry. This prevents horizontal sliding and tensile '
             'stone rupture, enabling Gothic builders to achieve monumental height, slender piers, and unprecedented '
             'structural stability across centuries of weathering and seismic micro-tremors.'},
 {'key': 'wild_fermentation',
  'title': 'Biochemistry of Wild Fermentation: Koji, Lactic Acid Bacteria, and Yeasts',
  'tags': ['fermentation', 'microbiology', 'biochemistry', 'culinary'],
  'content': '# Biochemistry of Wild Fermentation: Koji, Lactic Acid Bacteria, and Yeasts\n'
             '\n'
             'Fermentation is fundamentally a biological process of microbial preservation and enzymatic '
             'transformation, where microorganisms convert complex carbohydrates and proteins into organic acids, '
             'alcohols, and aromatic flavor compounds under anaerobic or microaerophilic conditions. Long before Louis '
             'Pasteur identified microorganisms as the causal agents of fermentation in 1857, human civilizations '
             'harnessed microbial ecologies to preserve perishable harvests, eliminate toxins, and unlock profound '
             'culinary depths. The biochemistry of wild fermentation reveals an intricate dance of microbial '
             'succession, environmental pH modulation, and enzymatic hydrolysis.\n'
             '\n'
             'In traditional vegetable and dairy fermentations—such as sauerkraut, kimchi, and sourdough—Lactic Acid '
             'Bacteria (LAB) dominate through progressive ecological succession. The process begins under ambient '
             'salinity, typically two to three percent sodium chloride. Salt inhibits pathogenic putrefactive bacteria '
             'while drawing moisture and fermentable sugars out of plant cells through osmotic pressure. Initially, '
             'gas-producing heterofermentative bacteria like Leuconostoc mesenteroides proliferate, metabolizing '
             'glucose into lactic acid, acetic acid, ethanol, and carbon dioxide. As acid production depresses the '
             "medium's pH below 5.0, Leuconostoc strains become self-inhibited, paving the way for acid-tolerant "
             'homofermentative species, primarily Lactobacillus plantarum. These robust bacteria rapidly metabolize '
             'remaining sugars into pure lactic acid, driving the pH below 4.0 and creating an acidic environment '
             'where food spoilage organisms cannot survive.\n'
             '\n'
             'In East Asian fermentations—exemplified by miso, soy sauce, and sake—the process is initiated not by '
             'bacteria, but by the filamentous fungus Aspergillus oryzae, colloquially known as koji. Koji mold is '
             'cultivated onto steamed grains under strict temperature and humidity regimes. As the fungal hyphae '
             'colonize the grain substrate, they synthesize and secrete prodigious quantities of hydrolytic enzymes: '
             'alpha-amylase and glucoamylase break down complex starches into fermentable glucose, while acidic and '
             'neutral proteases cleave dense soy proteins into short-chain peptides and free amino acids, notably '
             'glutamic acid. This enzymatic cleavage creates the biochemical foundation of savory umami taste.\n'
             '\n'
             'When koji is subsequently combined with cooked legumes, salt, and water in anaerobic fermentation '
             'vessels, secondary fermenters take over. Halophilic yeasts such as Zygosaccharomyces rouxii and '
             'salt-tolerant lactic acid bacteria metabolize the glucose liberated by koji enzymes into complex esters, '
             'higher alcohols, and volatile aromatic compounds over months of maturation.\n'
             '\n'
             'Fermentation biochemistry illustrates how simple ecological guardrails—salinity, temperature, and '
             'anaerobiosis—can guide complex multi-species consortia toward culinary enrichment and microbiological '
             'stability, preserving nutritious food without artificial additives or energy-intensive refrigeration.\n'
             'In liquid fermentations such as cider, wine, and beer brewing, wild yeasts such as Brettanomyces and '
             'non-Saccharomyces species (e.g., Pichia, Torulaspora) execute complex secondary metabolic '
             'transformations. Unlike domesticated Saccharomyces strains that rapidly convert simple sugars into '
             'ethanol, wild strains slowly metabolize complex dextrins, autolyzed yeast lipids, and phenolic acids '
             'over extended maturation periods. Enzymatic esterification generates aromatic volatile compounds, '
             'including ethyl lactate and isoamyl acetate, creating intricate fruity, spicy, and earthy aromas. '
             'Understanding the biochemical kinetics of microbial competition, temperature coefficients, and oxygen '
             'exposure enables modern culinary artisans to guide wild fermentation toward profound sensory complexity, '
             'nutritional bioavailability, and microbiological stability without artificial preservatives. Beyond '
             'flavor development, homofermentative lactic acid bacteria produce specialized antimicrobial peptides '
             'known as bacteriocins, which, alongside high organic acid concentrations, selectively neutralize '
             'competitive pathogenic invaders including Listeria monocytogenes and Clostridium botulinum.'}]

# 5 Realistic Sources
SOURCE_SPECS: list[dict[str, Any]] = [
    {
        "title": "RFC 793 / TCP Protocol Specification & Layered Architecture Excerpt",
        "source_type": "text",
        "format": "txt",
        "tags": ["networking", "specifications", "ietf", "tcp"],
        "content": """RFC 793 Transmission Control Protocol Specification
DARPA Internet Program Protocol Specification - September 1981

The Transmission Control Protocol (TCP) is intended for use in highly reliable
host-to-host communications between computers in packet-switched computer networks.
The TCP resides above the Network Layer (IP) and provides process-to-process communication.

Key mechanisms:
1. Basic Data Transfer: TCP transmits a continuous stream of octets by packaging them into segments.
2. Reliability: TCP recovers from damaged, lost, duplicated, or out-of-order data via sequence numbers and positive acknowledgments (ACK).
3. Flow Control: TCP provides a sliding window mechanism that allows receiving hosts to govern transmission rates.
4. Multiplexing: Port numbers allow multiple application processes to concurrently utilize network facilities.
5. Connections: Reliable three-way handshake (SYN, SYN-ACK, ACK) establishes synchronized sequence state.""",
    },
    {
        "title": "Principles of Distributed Consistency & Replicated State (Shapiro et al.)",
        "source_type": "text",
        "format": "md",
        "tags": ["distributed-systems", "crdts", "consistency", "research"],
        "content": """# Conflict-Free Replicated Data Types: Principles & Formulations
Authors: Marc Shapiro, Nuno Preguiça, Carlos Baquero, Marek Zawirski (INRIA Research Report)

## Executive Summary
Replicated state in distributed systems historically relied on either pessimistic consensus (Paxos, Raft) or optimistic reconciliation with ad-hoc conflict resolution. Conflict-Free Replicated Data Types (CRDTs) mathematically eliminate conflict resolution through bounded join-semilattices.

### Foundational Theorems
- **Strong Eventual Consistency (SEC):** Any two replicas that have received the same set of updates have equivalent internal state.
- **Join-Semilattice Requirements:** The merge operator must be associative, commutative, and idempotent:
  1. Associative: (A ⊔ B) ⊔ C = A ⊔ (B ⊔ C)
  2. Commutative: A ⊔ B = B ⊔ A
  3. Idempotent: A ⊔ A = A
- **State vs Operation Formulations:** State-based (CvRDT) communicates complete states; Operation-based (CmRDT) communicates causal operations.""",
    },
    {
        "title": "Empirical Studies on Spaced Retrieval Practice in Long-Term Memory Retention",
        "source_type": "text",
        "format": "md",
        "tags": ["cognitive-science", "learning", "memory", "psychology"],
        "content": """# The Critical Importance of Retrieval Practice in Long-Term Retention
Journal of Cognitive Psychology, Experimental Review Series

## Abstract & Findings
Across four controlled laboratory experiments and classroom trials, researchers compared three study conditions:
1. Repeated Study (SS): Reading text passages four consecutive times.
2. Concept Mapping (MC): Constructing elaborate visual diagrams of reading material.
3. Retrieval Practice (ST): Reading material once followed by spaced active recall tests.

### Key Results
- In immediate testing (5 minutes post-study), the Repeated Study condition produced the highest confidence and recall.
- In delayed testing (1 week later), Retrieval Practice produced a 400% improvement in retained conceptual recall over Repeated Study.
- Testing is not merely an assessment tool; effortful retrieval alters memory traces, fostering neural reorganization and resisting subsequent forgetting.""",
    },
    {
        "title": "Attention Is All You Need & Dense Vector Representation Foundations",
        "source_type": "text",
        "format": "txt",
        "tags": ["ai", "transformers", "embeddings", "nlp"],
        "content": """Attention Is All You Need - Vaswani et al. (NeurIPS 2017)

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.
We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism
to draw global dependencies between input and output.

Scaled Dot-Product Attention:
Attention(Q, K, V) = softmax(Q * K^T / sqrt(d_k)) * V

Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions.
Dense vector embeddings extracted from Transformer hidden layers capture deep contextual relationships, forming the basis
for modern semantic search, retrieval-augmented generation, and approximate nearest neighbor indexing.""",
    },
    {
        "title": "Medieval Masonry & Vault Geometry: Structural Mechanics in the High Middle Ages",
        "source_type": "text",
        "format": "md",
        "tags": ["architecture", "history", "masonry", "structural-engineering"],
        "content": """# Structural Mechanics of the Gothic Flying Buttress and Ribbed Vault
Journal of Architectural Engineering & History

The structural system of High Gothic cathedrals represents a decisive transition from compressive gravity walls to skeletal equilibrium frameworks.
Key components:
- **Pointed Arch:** Reduces outward lateral thrust compared to Romanesque semicircular arches.
- **Ribbed Groin Vault:** Skeletons of diagonal arches concentrate ceiling weight onto isolated piers.
- **Flying Buttress:** Collects outward thrust high on nave walls and transports it outside the building perimeter to exterior flyers.
Settlement and thermal expansions are accommodated through lime mortar flexibility and articulated stone voussoirs.""",
    },
]

# 4 Curated Collections
COLLECTION_SPECS: list[dict[str, Any]] = [
    {
        "name": "Systems & Distributed Architecture",
        "description": "Foundational concepts in operating systems, network protocols, offline storage, and distributed consistency algorithms.",
        "note_keys": ["os_isolation", "osi_model", "offline_first", "crdt_systems"],
        "source_indices": [0, 1],
    },
    {
        "name": "AI & Information Retrieval",
        "description": "Architectures and empirical methodologies for machine learning evaluation, vector search, HNSW graphs, and RAG systems.",
        "note_keys": ["ml_evaluation", "vector_embeddings", "rag_architecture"],
        "source_indices": [3],
    },
    {
        "name": "Cognitive Science & Skill Mastery",
        "description": "Empirical models of human memory, spaced repetition algorithms, desirable difficulties, and deliberate practice frameworks.",
        "note_keys": ["spaced_repetition", "deliberate_practice"],
        "source_indices": [2],
    },
    {
        "name": "Interdisciplinary Domain Studies",
        "description": "Explorations into software verification, medieval structural engineering, and wild microbial fermentation biochemistry.",
        "note_keys": ["software_verification", "gothic_architecture", "wild_fermentation"],
        "source_indices": [4],
    },
]

# 5 Threads / Conversations with Interactive Message History
THREAD_SPECS: list[dict[str, Any]] = [
    {
        "title": "Deep Dive: Comparing CRDTs vs Operational Transformation for Offline Sync",
        "messages": [
            {
                "role": "user",
                "content": "Can you explain why modern collaborative applications favor CRDTs over Operational Transformation (OT) for offline-first synchronization?",
            },
            {
                "role": "assistant",
                "content": "Certainly. Operational Transformation (OT)—historically popularized by Google Docs—relies on a central server to establish an authoritative global sequence order for concurrent operations. When an offline client reconnects with dozens of buffered edits, the server must transform each operation against all intervening operations. This requires maintaining complete operation histories and complex transformation matrices.\n\nCRDTs (Conflict-Free Replicated Data Types) eliminate the need for centralized transformation. By representing document atoms with immutable, mathematically ordered fractional identifiers, CRDT operations commute naturally (A ⊔ B = B ⊔ A). Any replica can merge updates in any order or handle arbitrary network partitions, and all nodes converge on the identical state without central coordination.",
            },
            {
                "role": "user",
                "content": "What about memory overhead? I've heard CRDTs require much more RAM.",
            },
            {
                "role": "assistant",
                "content": "Early CRDT implementations indeed suffered from high memory overhead because every character required unique UUIDs and Lamport timestamps. However, contemporary libraries like Yjs and Automerge use run-length encoding and compact columnar arrays, reducing metadata overhead down to a few bytes per edit block. For modern devices, this overhead is negligible compared to the architectural simplicity of peer-to-peer convergence.",
            },
        ],
    },
    {
        "title": "OSI Layering vs Practical TCP/IP Stack in Edge Networks",
        "messages": [
            {
                "role": "user",
                "content": "Why did the TCP/IP stack win over the 7-layer OSI model in real-world deployment?",
            },
            {
                "role": "assistant",
                "content": "The victory of TCP/IP over the 7-layer OSI model reflects the classic engineering principle of 'rough consensus and running code'. While the ISO committee spent years formalizing abstract standards, the DARPA-funded researchers developing TCP/IP deployed working implementations on ARPANET, iterating rapidly based on operational telemetry.\n\nFurthermore, the OSI model's upper three layers (Session, Presentation, Application) proved overly rigid. Modern application developers preferred handling session state, cryptographic encryption (TLS), and serialization directly inside unified application libraries rather than traversing distinct operating system boundary layers.",
            },
        ],
    },
    {
        "title": "Mitigating Hallucinations in RAG via Reranking and Chunk Grounding",
        "messages": [
            {
                "role": "user",
                "content": "What are the most effective techniques to prevent LLM hallucinations in a RAG pipeline?",
            },
            {
                "role": "assistant",
                "content": "Preventing hallucinations in RAG requires interventions across both retrieval and generation:\n\n1. **Hybrid Retrieval:** Combine dense vector embeddings with sparse BM25 lexical search to capture both semantic concepts and exact technical keywords.\n2. **Cross-Encoder Reranking:** Bi-encoder vector search is fast but coarse. Passing top-20 candidates through a cross-encoder evaluates token-level interactions, filtering out irrelevant chunks before prompting.\n3. **Strict Citation Prompting:** Instruct the model to cite specific chunk IDs for every factual assertion and explicitly decline to answer if the provided context lacks sufficient evidence.\n4. **Context Chunk Truncation:** Avoid overwhelming the LLM with massive context dumps; high-precision, focused chunks minimize distraction and attention dilution.",
            },
        ],
    },
    {
        "title": "Designing Spaced Repetition Schedules with Dynamic Forgetting Curves",
        "messages": [
            {
                "role": "user",
                "content": "How does the modern FSRS algorithm improve upon the classic SM-2 spaced repetition scheduler?",
            },
            {
                "role": "assistant",
                "content": "The SM-2 algorithm (dating back to 1987) uses fixed heuristic multipliers: every successful recall increases the interval by an 'Ease Factor' initialized around 2.5. However, this model struggles when learners review cards early or late, and it cannot adapt to individual memory variations.\n\nFSRS (Free Spaced Repetition Scheduler) applies modern Bayesian estimation and DSR (Difficulty, Stability, Retrievability) modeling. It continuously fits parameters against the user's historical review log, modeling retrievability as an exponential decay function. This allows FSRS to achieve an exact target retention rate (e.g., 90%) with 20% to 30% fewer reviews than SM-2.",
            },
        ],
    },
    {
        "title": "Gothic Ribbed Vaults: Structural Load Distribution and Aesthetics",
        "messages": [
            {
                "role": "user",
                "content": "How did Gothic cathedrals achieve such massive window openings compared to Romanesque structures?",
            },
            {
                "role": "assistant",
                "content": "Gothic builders achieved monumental window openings by transforming stone masonry from continuous load-bearing walls into an articulated skeletal frame.\n\nIn Romanesque architecture, the thick stone walls directly supported the roof and vault weight. Piercing them with large openings caused wall collapse. In Gothic architecture, pointed arches and diagonal ribbed vaults directed compressive roof loads onto discrete interior stone piers. External flying buttresses caught the remaining horizontal thrusts high up and redirected them outside to ground buttresses. With walls relieved of structural duty, masons replaced stone with luminous stained glass curtains.",
            },
        ],
    },
]

# Flashcard Deck Specifications (Pedagogical Decks)
FLASHCARD_SPECS: list[dict[str, Any]] = [
    {
        "title": "OSI Reference Model: Core Concepts",
        "note_key": "osi_model",
        "cards": [
            {
                "question": "What is the main purpose of the OSI model?",
                "answer": "To provide a conceptual framework that standardizes network communication functions into seven distinct layers, enabling interoperability across diverse vendor technologies.",
                "explanation": "Developed by ISO in 1984, the Open Systems Interconnection model decouples hardware protocols from user applications so different systems can communicate reliably.",
                "category": "Architecture & Purpose",
            },
            {
                "question": "Which layer of the OSI model is responsible for end-to-end data transfer and flow control?",
                "answer": "Layer 4 — The Transport Layer.",
                "explanation": "The Transport Layer (utilizing TCP or UDP) ensures complete data transfer, error detection, sequencing, and flow regulation between host applications.",
                "category": "Transport Layer",
            },
            {
                "question": "At which layer do routers operate to forward packets across different networks?",
                "answer": "Layer 3 — The Network Layer.",
                "explanation": "The Network Layer manages logical addressing (such as IPv4 and IPv6) and path determination across interconnected networks.",
                "category": "Network Layer",
            },
            {
                "question": "What is the primary function of Layer 2 (Data Link Layer)?",
                "answer": "Reliable node-to-node frame transfer across a physical medium using MAC addresses and error detection (FCS/CRC).",
                "explanation": "The Data Link Layer packages packets into frames and handles media access control and physical addressing on local network segments.",
                "category": "Data Link Layer",
            },
            {
                "question": "What are the Protocol Data Units (PDUs) for Layers 1, 2, 3, and 4?",
                "answer": "Bits (Layer 1), Frames (Layer 2), Packets (Layer 3), and Segments/Datagrams (Layer 4).",
                "explanation": "Each layer encapsulates data received from the layer above into its own protocol data unit by prepending specialized headers.",
                "category": "Encapsulation & PDUs",
            },
        ],
    },
    {
        "title": "Conflict-Free Replicated Data Types (CRDTs)",
        "note_key": "crdt_systems",
        "cards": [
            {
                "question": "What is Strong Eventual Consistency (SEC) in CRDTs?",
                "answer": "A guarantee that any two replicas that have received the same set of updates will converge to the identical state, regardless of update order or arrival paths.",
                "explanation": "Unlike weak eventual consistency which may require complex manual reconciliation, SEC guarantees mathematical identity upon update delivery.",
                "category": "Consistency Guarantees",
            },
            {
                "question": "What three algebraic properties must a state-based CRDT merge operator satisfy?",
                "answer": "Associativity, Commutativity, and Idempotence (forming a bounded join-semilattice).",
                "explanation": "Associativity allows grouping in any order; commutativity allows arrival in any order; idempotence guarantees duplicate messages cause no harm.",
                "category": "Lattice Properties",
            },
            {
                "question": "How do sequence CRDTs like Yjs handle concurrent text insertions at the same cursor position?",
                "answer": "By assigning immutable fractional identifiers with deterministic tie-breaking based on client ID and Lamport timestamp.",
                "explanation": "Because IDs are fractional and uniquely ordered, concurrent edits resolve to the exact same visual character sequence across all peers.",
                "category": "Sequence CRDTs",
            },
        ],
    },
    {
        "title": "Cognitive Science: Spaced Repetition and Testing",
        "note_key": "spaced_repetition",
        "cards": [
            {
                "question": "What is the Testing Effect (Retrieval Practice)?",
                "answer": "The finding that actively retrieving information from memory produces far superior long-term retention compared to passive rereading.",
                "explanation": "Retrieval modifies memory traces, reorganizes conceptual schemas, and triggers active neural consolidation.",
                "category": "Retrieval Practice",
            },
            {
                "question": "What is Hermann Ebbinghaus's Forgetting Curve?",
                "answer": "A mathematical model showing that memory retention decays exponentially over time, with the steepest decline occurring shortly after initial learning.",
                "explanation": "Each successful spaced retrieval flattens the curve, progressively extending the duration of memory stability.",
                "category": "Forgetting Curve",
            },
            {
                "question": "What does Robert Bjork mean by 'Desirable Difficulties'?",
                "answer": "Learning conditions that feel challenging and slow in the short term, but trigger robust long-term retention and flexible transfer.",
                "explanation": "Effortless retrieval produces minimal consolidation; effortful recall signals to the brain that the concept is critical to preserve.",
                "category": "Desirable Difficulties",
            },
        ],
    },
]

# Explicit Note Links (conceptually meaningful connections)
NOTE_LINKS: list[tuple[str, str, str]] = [
    ("vector_embeddings", "rag_architecture", "Provides dense semantic representations for retrieval grounding"),
    ("offline_first", "crdt_systems", "Employs algebraic data structures for peer-to-peer divergence resolution"),
    ("spaced_repetition", "deliberate_practice", "Underpins cognitive consolidation during deliberate skill acquisition"),
    ("os_isolation", "osi_model", "Shares principles of strict layer encapsulation and interface contracts"),
    ("ml_evaluation", "software_verification", "Complements empirical statistical validation with invariant property testing"),
]


def _get_or_create_seed_tag(db: Session, workspace_id: uuid.UUID) -> Tag:
    """Ensure the #seed-demo tag exists in the workspace."""
    tag = db.scalar(
        select(Tag).where(Tag.workspace_id == workspace_id, Tag.name == SEED_TAG_NAME)
    )
    if not tag:
        tag = Tag(workspace_id=workspace_id, name=SEED_TAG_NAME)
        db.add(tag)
        db.flush()
    return tag


def seed_demo_workspace(
    db: Session,
    workspace_id: uuid.UUID,
    creator_id: uuid.UUID,
) -> dict[str, Any]:
    """Populate a workspace with realistic, idempotent demonstration knowledge data.

    Creates:
    - 12 substantial notes (500-600 words)
    - 5 realistic sources with chunks
    - 4 organized collections
    - 5 interactive conversation threads
    - 3 pedagogical flashcard decks
    - 5 bidirectional note links
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    seed_tag = _get_or_create_seed_tag(db, workspace_id)

    # 1. Notes (Idempotent by key or title in this workspace)
    created_notes_count = 0
    reused_notes_count = 0
    notes_by_key: dict[str, Note] = {}
    all_seed_chunks: list[ContentChunk] = []

    for spec in NOTE_SPECS:
        existing = db.scalar(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.title == spec["title"],
            )
        )
        if existing:
            notes_by_key[spec["key"]] = existing
            reused_notes_count += 1
            continue

        raw_meta = {
            "is_demo_seed": True,
            "seed_batch_id": SEED_BATCH_ID,
            "spec_key": spec["key"],
        }
        note = Note(
            workspace_id=workspace_id,
            title=spec["title"],
            content=spec["content"].strip(),
            created_by=creator_id,
            extract_knowledge=True,
            metadata_=raw_meta,
        )
        db.add(note)
        db.flush()

        note.tags.append(seed_tag)
        # Add custom topic tags
        for tname in spec.get("tags", []):
            t_obj = db.scalar(
                select(Tag).where(Tag.workspace_id == workspace_id, Tag.name == tname)
            )
            if not t_obj:
                t_obj = Tag(workspace_id=workspace_id, name=tname)
                db.add(t_obj)
                db.flush()
            note.tags.append(t_obj)
        db.flush()

        # Create initial content chunk for search/indexing
        chunk = ContentChunk(
            workspace_id=workspace_id,
            note_id=note.id,
            chunk_index=0,
            content=note.content[:1000],
            token_count=len(note.content[:1000].split()),
            content_hash=f"seed_hash_{note.id}",
            embedding_model="text-embedding-3-small",
            embedding_dimension=1536,
        )
        db.add(chunk)
        db.flush()
        all_seed_chunks.append(chunk)

        notes_by_key[spec["key"]] = note
        created_notes_count += 1

    # 2. Sources (Idempotent by title)
    created_sources_count = 0
    reused_sources_count = 0
    sources_list: list[Source] = []

    for src_spec in SOURCE_SPECS:
        existing_src = db.scalar(
            select(Source).where(
                Source.workspace_id == workspace_id,
                Source.source_identifier == src_spec["title"],
            )
        )
        if existing_src:
            sources_list.append(existing_src)
            reused_sources_count += 1
            continue

        src_meta = {
            "is_demo_seed": True,
            "seed_batch_id": SEED_BATCH_ID,
            "format": src_spec["format"],
            "tags": src_spec["tags"],
        }
        source = Source(
            workspace_id=workspace_id,
            source_type=src_spec["source_type"],
            original_path=f"{src_spec['title']}.{src_spec['format']}",
            source_identifier=src_spec["title"],
            content_hash=f"seed_src_hash_{uuid.uuid4().hex[:12]}",
            import_batch_id=uuid.uuid4(),
            import_status="completed",
            raw_metadata=src_meta,
        )
        db.add(source)
        db.flush()

        # Add chunk for source
        s_chunk = ContentChunk(
            workspace_id=workspace_id,
            source_id=source.id,
            chunk_index=0,
            content=src_spec["content"][:1000],
            token_count=len(src_spec["content"][:1000].split()),
            content_hash=f"seed_chunk_{source.id}",
            embedding_model="text-embedding-3-small",
            embedding_dimension=1536,
        )
        db.add(s_chunk)
        db.flush()
        all_seed_chunks.append(s_chunk)

        sources_list.append(source)
        created_sources_count += 1

    # Upsert vector embeddings for seed chunks if vector store / embeddings are active
    if all_seed_chunks:
        try:
            texts = [c.content for c in all_seed_chunks]
            embs = embedding_service.get_embeddings_batch(texts)
            vector_service.upsert_chunks(workspace_id=workspace_id, chunks=all_seed_chunks, embeddings=embs)
            logger.info("Successfully indexed %d seed chunks in vector store", len(all_seed_chunks))
        except Exception as v_err:
            logger.warning("Could not upsert seed chunks to vector store: %s", v_err)

    # 3. Collections (Idempotent by name)
    created_collections_count = 0
    reused_collections_count = 0

    for col_spec in COLLECTION_SPECS:
        existing_col = db.scalar(
            select(Collection).where(
                Collection.workspace_id == workspace_id,
                Collection.name == col_spec["name"],
            )
        )
        if existing_col:
            reused_collections_count += 1
            collection = existing_col
        else:
            collection = Collection(
                workspace_id=workspace_id,
                name=col_spec["name"],
                description=col_spec["description"],
                created_by=creator_id,
            )
            db.add(collection)
            db.flush()
            created_collections_count += 1

        # Link member notes
        for nkey in col_spec["note_keys"]:
            note_obj = notes_by_key.get(nkey)
            if note_obj:
                has_link = db.scalar(
                    select(CollectionNote).where(
                        CollectionNote.collection_id == collection.id,
                        CollectionNote.note_id == note_obj.id,
                    )
                )
                if not has_link:
                    db.add(CollectionNote(collection_id=collection.id, note_id=note_obj.id))

        # Link member sources
        for sidx in col_spec["source_indices"]:
            if sidx < len(sources_list):
                src_obj = sources_list[sidx]
                has_slink = db.scalar(
                    select(CollectionSource).where(
                        CollectionSource.collection_id == collection.id,
                        CollectionSource.source_id == src_obj.id,
                    )
                )
                if not has_slink:
                    db.add(CollectionSource(collection_id=collection.id, source_id=src_obj.id))

        db.flush()

    # 4. Note Links
    created_links_count = 0
    for src_key, tgt_key, rel_type in NOTE_LINKS:
        sn = notes_by_key.get(src_key)
        tn = notes_by_key.get(tgt_key)
        if sn and tn and sn.id != tn.id:
            link_exists = db.scalar(
                select(NoteLink).where(
                    NoteLink.source_note_id == sn.id,
                    NoteLink.target_note_id == tn.id,
                )
            )
            if not link_exists:
                db.add(
                    NoteLink(
                        source_note_id=sn.id,
                        target_note_id=tn.id,
                    )
                )
                created_links_count += 1
    db.flush()

    # 5. Threads & Conversations (Idempotent by title)
    created_threads_count = 0
    reused_threads_count = 0

    for thr_spec in THREAD_SPECS:
        existing_conv = db.scalar(
            select(Conversation).where(
                Conversation.workspace_id == workspace_id,
                Conversation.title == thr_spec["title"],
            )
        )
        if existing_conv:
            reused_threads_count += 1
            conv = existing_conv
        else:
            conv = Conversation(
                workspace_id=workspace_id,
                title=thr_spec["title"],
            )
            db.add(conv)
            db.flush()
            created_threads_count += 1

            for m_idx, m_data in enumerate(thr_spec["messages"]):
                msg = Message(
                    conversation_id=conv.id,
                    workspace_id=workspace_id,
                    role=m_data["role"],
                    content=m_data["content"],
                )
                db.add(msg)
            db.flush()

    # 6. Flashcard Decks in Conversation Messages
    created_flashcards_count = 0
    for f_spec in FLASHCARD_SPECS:
        matching_note = notes_by_key.get(f_spec["note_key"])
        deck_title = f_spec["title"]
        # Check if conversation for flashcard deck already exists
        conv_title = f"Flashcard Deck: {deck_title}"
        existing_fconv = db.scalar(
            select(Conversation).where(
                Conversation.workspace_id == workspace_id,
                Conversation.title == conv_title,
            )
        )
        if not existing_fconv:
            fconv = Conversation(
                workspace_id=workspace_id,
                title=conv_title,
            )
            db.add(fconv)
            db.flush()

            # Build flashcard deck dictionary
            cards_with_ids = []
            for idx, c in enumerate(f_spec["cards"]):
                card_item = dict(c)
                card_item["id"] = f"card-{idx+1}-{uuid.uuid4().hex[:8]}"
                cards_with_ids.append(card_item)

            deck_dict = {
                "deck_id": f"deck-{matching_note.id if matching_note else uuid.uuid4().hex[:8]}",
                "title": deck_title,
                "source_title": matching_note.title if matching_note else deck_title,
                "source_id": str(matching_note.id) if matching_note else None,
                "source_type": "note",
                "cards_count": len(cards_with_ids),
                "total_cards": len(cards_with_ids),
                "cards": cards_with_ids,
            }
            # Record user command
            db.add(
                Message(
                    conversation_id=fconv.id,
                    workspace_id=workspace_id,
                    role="user",
                    content=f'/generate-flashcards "{matching_note.title if matching_note else deck_title}"',
                )
            )
            # Record assistant card result with standard envelope
            assistant_content = f"I've generated a flashcard deck from your notes on {matching_note.title if matching_note else deck_title}."
            card_payload = {
                "command": "/generate-flashcards",
                "action_id": "notes.get",
                "status": "completed",
                "card_type": "flashcards",
                "flashcardDeck": deck_dict,
                "message": assistant_content,
                "requires_confirmation": False,
            }
            assistant_full_text = f"{assistant_content}\n\n<!--hyades-action-result:{json.dumps(card_payload)}-->"
            db.add(
                Message(
                    conversation_id=fconv.id,
                    workspace_id=workspace_id,
                    role="assistant",
                    content=assistant_full_text,
                )
            )
            db.flush()
            created_flashcards_count += 1

            # Also associate deck with note metadata for quick access
            if matching_note:
                meta = dict(matching_note.metadata_ or {})
                meta["flashcardDeck"] = deck_dict
                matching_note.metadata_ = meta

    db.commit()

    return {
        "status": "success",
        "workspace_id": str(workspace_id),
        "notes_created": created_notes_count,
        "notes_reused": reused_notes_count,
        "sources_created": created_sources_count,
        "sources_reused": reused_sources_count,
        "collections_created": created_collections_count,
        "collections_reused": reused_collections_count,
        "threads_created": created_threads_count,
        "threads_reused": reused_threads_count,
        "links_created": created_links_count,
        "flashcard_decks_created": created_flashcards_count,
        "seed_batch_id": SEED_BATCH_ID,
    }


def cleanup_demo_seed_data(db: Session, workspace_id: uuid.UUID) -> dict[str, Any]:
    """Safely delete all seeded demonstration records in a workspace.

    Guarantees user-created notes, sources, collections, and threads remain completely untouched.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    # 1. Delete seeded notes
    all_notes = db.scalars(
        select(Note).where(Note.workspace_id == workspace_id)
    ).all()
    deleted_notes_count = 0
    for note in all_notes:
        meta = note.metadata_ or {}
        is_seed = (
            meta.get("is_demo_seed") is True
            or any(t.name == SEED_TAG_NAME for t in note.tags)
        )
        if is_seed:
            note_service.delete_note(db, note.id)
            deleted_notes_count += 1

    # 2. Delete seeded sources
    seeded_sources = db.scalars(
        select(Source).where(Source.workspace_id == workspace_id)
    ).all()
    deleted_sources_count = 0
    for src in seeded_sources:
        meta = src.raw_metadata or {}
        if meta.get("is_demo_seed") is True:
            try:
                vector_service.delete_source_vectors(src.id, workspace_id)
            except Exception:
                pass
            db.delete(src)
            deleted_sources_count += 1
    db.flush()

    # 3. Delete seeded collections
    seed_col_names = {s["name"] for s in COLLECTION_SPECS}
    seeded_collections = db.scalars(
        select(Collection).where(
            Collection.workspace_id == workspace_id,
            Collection.name.in_(seed_col_names),
        )
    ).all()
    deleted_collections_count = len(seeded_collections)
    for col in seeded_collections:
        db.delete(col)
    db.flush()

    # 4. Delete seeded conversations / threads
    seed_thr_titles = {s["title"] for s in THREAD_SPECS}
    all_convs = db.scalars(
        select(Conversation).where(Conversation.workspace_id == workspace_id)
    ).all()
    deleted_convs_count = 0
    for conv in all_convs:
        if conv.title in seed_thr_titles or (conv.title and conv.title.startswith("Flashcard Deck:")):
            db.delete(conv)
            deleted_convs_count += 1
    db.flush()

    # 5. Delete orphaned seed tag if present
    seed_tag = db.scalar(
        select(Tag).where(Tag.workspace_id == workspace_id, Tag.name == SEED_TAG_NAME)
    )
    if seed_tag:
        db.delete(seed_tag)

    db.commit()

    return {
        "status": "cleaned",
        "workspace_id": str(workspace_id),
        "notes_deleted": deleted_notes_count,
        "sources_deleted": deleted_sources_count,
        "collections_deleted": deleted_collections_count,
        "threads_deleted": deleted_convs_count,
    }
