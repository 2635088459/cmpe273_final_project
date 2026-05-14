"""
Generate clean, professional diagram PNGs for the EraseGraph presentation.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette ───────────────────────────────────────────────────────────────────
BG     = '#FFFFFF'
NAVY   = '#1E293B'
GRAY   = '#475569'
LGRAY  = '#94A3B8'
BORDER = '#CBD5E1'

BLUE   = '#2563EB'
ORANGE = '#EA580C'
GREEN  = '#059669'
PURPLE = '#7C3AED'
AMBER  = '#D97706'
RED    = '#DC2626'
TEAL   = '#0891B2'

FONT = 'DejaVu Sans'


def new_fig(w, h, dpi=150):
    fig, ax = plt.subplots(figsize=(w, h), dpi=dpi)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    return fig, ax


def rbox(ax, x, y, w, h, accent, label='', sub='', fs=11, sub_fs=9, radius=0.018):
    fill = accent + '18'
    p = FancyBboxPatch((x, y), w, h,
                       boxstyle=f'round,pad=0,rounding_size={radius}',
                       linewidth=2.2, edgecolor=accent, facecolor=fill,
                       zorder=3, clip_on=False)
    ax.add_patch(p)
    cx, cy = x + w / 2, y + h / 2
    if label and sub:
        ax.text(cx, cy + h * 0.14, label, ha='center', va='center',
                fontsize=fs, fontweight='bold', color=accent,
                fontfamily=FONT, zorder=4, clip_on=False)
        ax.text(cx, cy - h * 0.14, sub, ha='center', va='center',
                fontsize=sub_fs, color=GRAY, fontfamily=FONT, zorder=4, clip_on=False)
    elif label:
        ax.text(cx, cy, label, ha='center', va='center',
                fontsize=fs, fontweight='bold', color=accent,
                fontfamily=FONT, zorder=4, clip_on=False)


def box_edge(bx, by, bw, bh, tx, ty):
    cx, cy = bx + bw / 2, by + bh / 2
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy
    if abs(dx) == 0:
        t = (bh / 2) / abs(dy)
    elif abs(dy) == 0:
        t = (bw / 2) / abs(dx)
    else:
        t = min((bw / 2) / abs(dx), (bh / 2) / abs(dy))
    return cx + t * dx, cy + t * dy


def circle_edge(cx, cy, r, tx, ty):
    dx, dy = tx - cx, ty - cy
    dist = (dx ** 2 + dy ** 2) ** 0.5
    if dist == 0:
        return cx, cy
    return cx + r * dx / dist, cy + r * dy / dist


def arr(ax, x1, y1, x2, y2, color=LGRAY, lw=1.8, label='', rad=0.0):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                                connectionstyle=f'arc3,rad={rad}',
                                mutation_scale=14),
                zorder=2, clip_on=False)
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.022, label, ha='center', va='bottom',
                fontsize=8.5, color=color, fontfamily=FONT, zorder=5,
                bbox=dict(boxstyle='round,pad=0.15', fc=BG, ec='none', alpha=0.9))


def arr_boxes(ax, b1, b2, color=LGRAY, lw=1.8, label='', rad=0.0):
    c1 = (b1[0] + b1[2] / 2, b1[1] + b1[3] / 2)
    c2 = (b2[0] + b2[2] / 2, b2[1] + b2[3] / 2)
    p1 = box_edge(*b1, *c2)
    p2 = box_edge(*b2, *c1)
    arr(ax, *p1, *p2, color=color, lw=lw, label=label, rad=rad)


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=150, bbox_inches='tight', pad_inches=0.25, facecolor=BG)
    plt.close()
    print(f'  saved {name}')


# ════════════════════════════════════════════════════════════════════════════
# 1. Problem
# ════════════════════════════════════════════════════════════════════════════
def diag_problem():
    fig, ax = new_fig(10, 7)

    cx, cy, r = 0.50, 0.52, 0.085
    circle = plt.Circle((cx, cy), r, facecolor='#DBEAFE',
                         edgecolor=BLUE, linewidth=2.5, zorder=3)
    ax.add_patch(circle)
    ax.text(cx, cy + 0.022, 'USER', ha='center', va='center',
            fontsize=13, fontweight='bold', color=BLUE, fontfamily=FONT, zorder=4)
    ax.text(cx, cy - 0.026, 'Subject', ha='center', va='center',
            fontsize=9.5, color=GRAY, fontfamily=FONT, zorder=4)

    bw, bh = 0.22, 0.115
    stores = [
        (0.50, 0.85, ORANGE, 'PostgreSQL',   'Primary DB'),
        (0.80, 0.68, BLUE,   'Redis',         'Cache Layer'),
        (0.80, 0.30, PURPLE, 'Elasticsearch', 'Search Index'),
        (0.50, 0.14, AMBER,  'Backup / S3',   'Blob Store'),
        (0.20, 0.30, GREEN,  'Analytics DB',  'Data Warehouse'),
    ]
    for sx, sy, col, name, sub in stores:
        bx, by = sx - bw / 2, sy - bh / 2
        p1 = circle_edge(cx, cy, r + 0.005, sx, sy)
        p2 = box_edge(bx, by, bw, bh, cx, cy)
        ax.annotate('', xy=p2, xytext=p1,
                    arrowprops=dict(arrowstyle='<->', color=col, lw=2.0,
                                   linestyle='--', mutation_scale=12),
                    zorder=2, clip_on=False)
        rbox(ax, bx, by, bw, bh, col, name, sub, fs=10.5, sub_fs=8.5)

    ax.text(0.50, 0.025,
            'Deleting from one system leaves data live in all others',
            ha='center', va='bottom', fontsize=11.5, color=RED,
            fontweight='bold', fontfamily=FONT)
    save(fig, 'diag_problem.png')


# ════════════════════════════════════════════════════════════════════════════
# 2. Solution flow
# ════════════════════════════════════════════════════════════════════════════
def diag_solution_flow():
    fig, ax = new_fig(14, 3.6)

    steps = [
        (BLUE,   'Deletion\nRequest'),
        (ORANGE, 'Backend\nOrchestrator'),
        (PURPLE, 'RabbitMQ\nEvent Bus'),
        (GREEN,  'Cleanup\nWorkers ×5'),
        (AMBER,  'Proof\nAudit Chain'),
        (BLUE,   'Admin\nDashboard'),
    ]
    edge_labels = ['REST / SSE', 'AMQP publish', 'fan-out', 'result events', 'view']

    n = len(steps)
    margin = 0.04
    sp = (1.0 - 2 * margin) / n
    bw, bh, by = sp * 0.76, 0.52, 0.26

    boxes = []
    for i, (col, lbl) in enumerate(steps):
        bx = margin + i * sp + (sp - bw) / 2
        rbox(ax, bx, by, bw, bh, col, lbl, fs=11, radius=0.022)
        boxes.append((bx, by, bw, bh))

    for i in range(n - 1):
        arr_boxes(ax, boxes[i], boxes[i + 1], color=LGRAY, lw=2.0,
                  label=edge_labels[i])

    save(fig, 'diag_solution_flow.png')


# ════════════════════════════════════════════════════════════════════════════
# 3. Architecture
# ════════════════════════════════════════════════════════════════════════════
def diag_architecture():
    fig, ax = new_fig(14, 9.5)

    layers = [
        (0.88, 0.97, '#EFF6FF', BLUE,   'CLIENT'),
        (0.74, 0.87, '#FFF7ED', ORANGE, 'ORCHESTRATION'),
        (0.58, 0.73, '#F5F3FF', PURPLE, 'MESSAGING'),
        (0.36, 0.57, '#ECFDF5', GREEN,  'WORKERS'),
        (0.04, 0.35, '#FFFBEB', AMBER,  'STORAGE'),
    ]
    for y0, y1, fc, ec, lbl in layers:
        band = FancyBboxPatch((0.02, y0), 0.96, y1 - y0,
                              boxstyle='round,pad=0,rounding_size=0.01',
                              linewidth=1, edgecolor=ec + '55', facecolor=fc, zorder=0)
        ax.add_patch(band)
        ax.text(0.035, (y0 + y1) / 2, lbl, ha='left', va='center',
                fontsize=8, fontweight='bold', color=ec, fontfamily=FONT, alpha=0.7)

    fe = (0.20, 0.895, 0.60, 0.065)
    rbox(ax, *fe[:2], fe[2], fe[3], BLUE,
         'Frontend Dashboard (React)',
         'Status  ·  Proof Chain  ·  Bulk Upload  ·  Admin Panel',
         fs=12, sub_fs=9.5)

    be = (0.08, 0.755, 0.84, 0.068)
    rbox(ax, *be[:2], be[2], be[3], ORANGE,
         'Backend Orchestrator (NestJS)',
         'Workflow Coordination  ·  Auth  ·  Retry Logic  ·  SLA Monitor  ·  Proof Chain',
         fs=12, sub_fs=9.5)

    p1 = box_edge(*fe, fe[0] + fe[2] / 2, be[1])
    p2 = box_edge(*be, fe[0] + fe[2] / 2, fe[1])
    arr(ax, p1[0], p1[1], p2[0], p2[1], BLUE, 2.0, 'REST / SSE')

    obs = (0.08, 0.600, 0.32, 0.068)
    rmq = (0.58, 0.600, 0.34, 0.068)
    rbox(ax, *obs[:2], obs[2], obs[3], TEAL,
         'Observability Stack',
         'OpenTelemetry  ·  Jaeger  ·  Prometheus  ·  Grafana',
         fs=10.5, sub_fs=8.5)
    rbox(ax, *rmq[:2], rmq[2], rmq[3], PURPLE,
         'RabbitMQ',
         'Topic Exchange  ·  DLQ  ·  Retry Queue',
         fs=12, sub_fs=9.5)

    p1 = box_edge(*be, rmq[0] + rmq[2] / 2, rmq[1])
    p2 = box_edge(*rmq, be[0] + be[2] / 2, be[1])
    arr(ax, p1[0], p1[1], p2[0], p2[1], PURPLE, 2.0, 'AMQP publish')

    p1 = box_edge(*be, obs[0] + obs[2] / 2, obs[1])
    p2 = box_edge(*obs, be[0] + be[2] / 2, be[1])
    arr(ax, p1[0], p1[1], p2[0], p2[1], TEAL, 1.8, 'traces / metrics')

    workers = [
        (0.08,  ORANGE, 'Cache\nCleanup'),
        (0.265, BLUE,   'Search\nCleanup'),
        (0.450, GREEN,  'Analytics\nCleanup'),
        (0.635, AMBER,  'Backup\nService'),
        (0.820, PURPLE, 'Proof\nService'),
    ]
    ww, wh, wy = 0.155, 0.115, 0.415
    worker_boxes = []
    for wx, col, lbl in workers:
        rbox(ax, wx, wy, ww, wh, col, lbl, fs=10.5, radius=0.014)
        worker_boxes.append((wx, wy, ww, wh))

    rmq_cx = rmq[0] + rmq[2] / 2
    trunk_y = 0.555
    ax.plot([rmq_cx, rmq_cx], [rmq[1], trunk_y],
            color=PURPLE, lw=1.8, linestyle='--', alpha=0.7, zorder=2)
    for wb in worker_boxes:
        wcx = wb[0] + wb[2] / 2
        ax.plot([rmq_cx, wcx], [trunk_y, trunk_y],
                color=LGRAY, lw=1.2, linestyle='--', zorder=2)
        ax.annotate('', xy=(wcx, wb[1] + wb[3]), xytext=(wcx, trunk_y),
                    arrowprops=dict(arrowstyle='->', color=LGRAY, lw=1.5,
                                   mutation_scale=11), zorder=3, clip_on=False)
    ax.text(rmq_cx + 0.015, trunk_y + 0.013, 'event fan-out',
            fontsize=8.5, color=PURPLE, fontfamily=FONT, zorder=5,
            bbox=dict(boxstyle='round,pad=0.15', fc=BG, ec='none', alpha=0.95))

    ax.annotate('', xy=(0.955, be[1] + be[3] / 2), xytext=(0.955, wy + wh / 2),
                arrowprops=dict(arrowstyle='->', color=LGRAY, lw=1.5, mutation_scale=11),
                zorder=2, clip_on=False)
    ax.plot([worker_boxes[-1][0] + worker_boxes[-1][2], 0.955],
            [wy + wh / 2, wy + wh / 2], color=LGRAY, lw=1.5, linestyle='--', zorder=2)
    ax.plot([0.955, be[0] + be[2]], [be[1] + be[3] / 2, be[1] + be[3] / 2],
            color=LGRAY, lw=1.5, linestyle='--', zorder=2)
    ax.text(0.962, (wy + wh / 2 + be[1] + be[3] / 2) / 2, 'result\nevents',
            ha='left', va='center', fontsize=8.5, color=LGRAY, fontfamily=FONT)

    storage = [
        (0.08, 0.28, ORANGE, 'PostgreSQL', 'Requests · Proof Events · Steps'),
        (0.43, 0.24, AMBER,  'Redis',       'Circuit Breaker State'),
        (0.70, 0.24, PURPLE, 'S3 / Blob',  'Backup Artefacts'),
    ]
    storage_boxes = []
    for sx, sw, col, lbl, sub in storage:
        rbox(ax, sx, 0.065, sw, 0.10, col, lbl, sub, fs=10.5, sub_fs=8.5)
        storage_boxes.append((sx, 0.065, sw, 0.10))

    pg = storage_boxes[0]
    p1 = box_edge(*be, pg[0] + pg[2] / 2, pg[1])
    p2 = box_edge(*pg, be[0] + be[2] / 2, be[1])
    arr(ax, p1[0], p1[1], p2[0], p2[1], ORANGE, 1.5, 'TypeORM', rad=0.12)

    rd = storage_boxes[1]
    p1 = box_edge(*be, rd[0] + rd[2] / 2, rd[1])
    p2 = box_edge(*rd, be[0] + be[2] / 2, be[1])
    arr(ax, p1[0], p1[1], p2[0], p2[1], AMBER, 1.4, 'CB state', rad=-0.08)

    items = [(BLUE, 'Frontend'), (ORANGE, 'Orchestration'), (PURPLE, 'Messaging'),
             (GREEN, 'Workers'), (TEAL, 'Observability'), (AMBER, 'Storage')]
    lx = 0.08
    for col, lbl in items:
        ax.plot(lx + 0.012, 0.025, 's', color=col, markersize=9, zorder=5)
        ax.text(lx + 0.032, 0.025, lbl, va='center', fontsize=9,
                color=GRAY, fontfamily=FONT)
        lx += 0.155

    save(fig, 'diag_architecture.png')


# ════════════════════════════════════════════════════════════════════════════
# 4. Sequence diagram
# ════════════════════════════════════════════════════════════════════════════
def diag_sequence():
    fig, ax = new_fig(14, 9.5)

    ax.text(0.50, 0.975, 'End-to-End Deletion Sequence',
            ha='center', va='top', fontsize=15, fontweight='bold',
            color=NAVY, fontfamily=FONT)

    parts = [
        (0.08,  BLUE,   'Client'),
        (0.26,  ORANGE, 'Backend\nAPI'),
        (0.44,  PURPLE, 'RabbitMQ'),
        (0.62,  GREEN,  'Workers\n×5'),
        (0.79,  TEAL,   'Proof\nService'),
        (0.93,  AMBER,  'PostgreSQL'),
    ]

    pw, ph = 0.125, 0.082
    header_y = 0.885
    for px, col, lbl in parts:
        rbox(ax, px - pw / 2, header_y, pw, ph, col, lbl, fs=10, radius=0.013)

    life_top = header_y
    life_bot = 0.055
    for px, col, _ in parts:
        ax.plot([px, px], [life_top, life_bot],
                color=col, lw=1.2, linestyle='--', alpha=0.30, zorder=1)

    # (from_x, to_x, y, color, label, is_return)
    msgs = [
        (0.08, 0.26, 0.820, BLUE,   'POST /deletion-request',            False),
        (0.26, 0.93, 0.750, AMBER,  'INSERT deletion_request (PENDING)',  False),
        (0.26, 0.08, 0.680, BLUE,   '202 Accepted + request_id',         True),
        (0.26, 0.44, 0.610, PURPLE, 'publish deletion.initiated',         False),
        (0.44, 0.62, 0.540, GREEN,  'fan-out to 5 worker queues',         False),
        (0.62, 0.44, 0.470, GREEN,  'publish step.succeeded ×5',          True),
        (0.44, 0.26, 0.400, PURPLE, 'consume result events',              True),
        (0.26, 0.79, 0.330, TEAL,   'appendEvent()',                      False),
        (0.79, 0.93, 0.260, AMBER,  'INSERT proof_chain_events',          False),
        (0.26, 0.93, 0.190, AMBER,  'UPDATE request (COMPLETED)',         False),
        (0.26, 0.08, 0.120, GREEN,  'SSE: status = COMPLETED',            True),
    ]

    for i, (x1, x2, y, col, lbl, ret) in enumerate(msgs):
        arrow = FancyArrowPatch(
            posA=(x1, y), posB=(x2, y),
            arrowstyle='->', color=col, lw=1.8,
            linestyle='dashed' if ret else 'solid',
            mutation_scale=13, zorder=3, clip_on=False
        )
        ax.add_patch(arrow)

        # Step badge
        ax.text(0.022, y, str(i + 1), ha='center', va='center',
                fontsize=7.5, color=LGRAY, fontfamily=FONT,
                bbox=dict(boxstyle='circle,pad=0.18', fc=LGRAY + '18',
                          ec=LGRAY, linewidth=0.8))

        # Label above arrow
        mid_x = (x1 + x2) / 2
        ax.text(mid_x, y + 0.027, lbl, ha='center', va='bottom',
                fontsize=8.5, color=col, fontfamily=FONT, zorder=5,
                bbox=dict(boxstyle='round,pad=0.18', fc=BG, ec='none', alpha=0.92))

    # Legend
    ax.plot([0.35, 0.42], [0.028, 0.028], color=NAVY, lw=1.8, linestyle='solid', zorder=2)
    ax.text(0.43, 0.028, '= request', va='center', fontsize=9, color=GRAY, fontfamily=FONT)
    ax.plot([0.54, 0.61], [0.028, 0.028], color=NAVY, lw=1.8, linestyle='dashed', zorder=2)
    ax.text(0.62, 0.028, '= response / return', va='center', fontsize=9, color=GRAY, fontfamily=FONT)

    save(fig, 'diag_sequence.png')


# ════════════════════════════════════════════════════════════════════════════
# 5. Workflow
# ════════════════════════════════════════════════════════════════════════════
def diag_workflow():
    fig, ax = new_fig(13, 6.5)

    bw, bh = 0.17, 0.14
    states = {
        'PENDING':            (0.10, 0.68, AMBER),
        'RUNNING':            (0.33, 0.68, BLUE),
        'COMPLETED':          (0.60, 0.88, GREEN),
        'PARTIAL\nCOMPLETED': (0.60, 0.62, BLUE),
        'FAILED':             (0.60, 0.36, RED),
        'RETRYING':           (0.78, 0.36, PURPLE),
        'DLQ':                (0.93, 0.36, RED),
    }

    boxes = {}
    for name, (cx, cy, col) in states.items():
        bx, by = cx - bw / 2, cy - bh / 2
        rbox(ax, bx, by, bw, bh, col, name, fs=10.5, radius=0.014)
        boxes[name] = (bx, by, bw, bh)

    def ab(n1, n2, col, lbl='', rad=0.0):
        arr_boxes(ax, boxes[n1], boxes[n2], color=col, lw=2.0, label=lbl, rad=rad)

    ab('PENDING', 'RUNNING',            AMBER,  'validate')
    ab('RUNNING', 'COMPLETED',          GREEN,  'all succeed',  rad=-0.2)
    ab('RUNNING', 'PARTIAL\nCOMPLETED', BLUE,   'some succeed')
    ab('RUNNING', 'FAILED',             RED,    'all fail',     rad=0.2)
    ab('FAILED',  'RETRYING',           RED,    'auto-retry')
    ab('RETRYING','DLQ',                RED,    'max retries')

    r_box  = boxes['RETRYING']
    ru_box = boxes['RUNNING']
    ax.annotate('', xy=(ru_box[0] + ru_box[2] / 2, ru_box[1]),
                xytext=(r_box[0] + r_box[2] / 2, r_box[1]),
                arrowprops=dict(arrowstyle='->', color=PURPLE, lw=1.8,
                                connectionstyle='arc3,rad=0.45', mutation_scale=13),
                zorder=2, clip_on=False)
    ax.text(0.55, 0.178, 're-queue for retry', ha='center', va='center',
            fontsize=9, color=PURPLE, fontfamily=FONT,
            bbox=dict(boxstyle='round,pad=0.2', fc=BG, ec='none', alpha=0.9))

    ax.axhline(0.13, xmin=0.02, xmax=0.98, color=BORDER, lw=1.2, zorder=1)
    ax.text(0.03, 0.10, 'Per-service step states:', va='center',
            fontsize=10, color=NAVY, fontweight='bold', fontfamily=FONT)

    step_states = [
        ('PENDING', AMBER), ('RUNNING', BLUE), ('SUCCEEDED', GREEN),
        ('FAILED', RED), ('RETRYING', PURPLE), ('SKIPPED (CB OPEN)', LGRAY),
    ]
    sx = 0.30
    for lbl, col in step_states:
        w = len(lbl) * 0.0085 + 0.055
        rect2 = FancyBboxPatch((sx, 0.03), w, 0.085,
                               boxstyle='round,pad=0,rounding_size=0.012',
                               linewidth=1.6, edgecolor=col,
                               facecolor=col + '22', zorder=3)
        ax.add_patch(rect2)
        ax.text(sx + w / 2, 0.0725, lbl, ha='center', va='center',
                fontsize=8.5, fontweight='bold', color=col,
                fontfamily=FONT, zorder=4)
        sx += w + 0.018

    save(fig, 'diag_workflow.png')


# ════════════════════════════════════════════════════════════════════════════
# 6. Reliability
# ════════════════════════════════════════════════════════════════════════════
def diag_reliability():
    fig, ax = new_fig(14, 7.5)

    ax.text(0.50, 0.975, 'Failure Recovery & Reliability Mechanisms',
            ha='center', va='top', fontsize=15, fontweight='bold',
            color=NAVY, fontfamily=FONT)

    flow = [
        (0.05,  0.79, 0.13, RED,    'Worker\nFails'),
        (0.22,  0.79, 0.14, PURPLE, 'Retry Queue\n(TTL)'),
        (0.40,  0.79, 0.13, BLUE,   'Worker\nRetries'),
        (0.61,  0.87, 0.13, GREEN,  'SUCCEEDED'),
        (0.61,  0.70, 0.13, RED,    'FAILED'),
        (0.78,  0.70, 0.10, RED,    'DLQ'),
        (0.91,  0.79, 0.09, AMBER,  'Replay\nAPI'),
    ]
    fboxes = []
    for x, y, w, col, lbl in flow:
        rbox(ax, x, y - 0.065, w, 0.115, col, lbl, fs=10, radius=0.013)
        fboxes.append((x, y - 0.065, w, 0.115))

    def fa(i, j, col, lbl='', rad=0.0):
        arr_boxes(ax, fboxes[i], fboxes[j], color=col, lw=1.8, label=lbl, rad=rad)

    fa(0, 1, RED,    'nack')
    fa(1, 2, PURPLE, 're-deliver')
    fa(2, 3, GREEN,  'success', rad=-0.25)
    fa(2, 4, RED,    'fail',    rad=0.25)
    fa(4, 5, RED,    'max retries')
    fa(5, 6, AMBER)
    fa(6, 3, AMBER,  'replay',  rad=-0.45)

    ax.axhline(0.595, xmin=0.02, xmax=0.98, color=BORDER, lw=1.5, zorder=1)

    panels = [
        (0.02,  ORANGE, 'Retry + Dead-Letter Queue', [
            'Exponential back-off between attempts',
            'Dead-letter exchange after N failures',
            'Ops replay API for manual recovery',
            'RabbitMQ TTL + x-dead-letter-exchange',
        ]),
        (0.355, PURPLE, 'Idempotency Guard', [
            'processed_events(event_id, service_name)',
            'Postgres UNIQUE constraint (23505)',
            'Duplicate → silent skip, no error',
            'Logged as DUPLICATE_EVENT_IGNORED proof',
        ]),
        (0.69,  BLUE,   'Circuit Breaker', [
            'Per-service state stored in Redis',
            'CLOSED → OPEN after failure threshold',
            'OPEN → step skipped (SKIPPED_CIRCUIT_OPEN)',
            'Half-open probe auto-resets on cooldown',
        ]),
    ]
    for px, col, title, bullets in panels:
        panel = FancyBboxPatch((px + 0.01, 0.04), 0.305, 0.52,
                               boxstyle='round,pad=0,rounding_size=0.018',
                               linewidth=2.2, edgecolor=col,
                               facecolor=col + '12', zorder=3)
        ax.add_patch(panel)
        ax.text(px + 0.163, 0.535, title, ha='center', va='center',
                fontsize=11.5, fontweight='bold', color=col, fontfamily=FONT, zorder=4)
        for i, b in enumerate(bullets):
            ax.text(px + 0.04, 0.455 - i * 0.09, f'▸  {b}',
                    ha='left', va='center', fontsize=9.5,
                    color=GRAY, fontfamily=FONT, zorder=4)

    save(fig, 'diag_reliability.png')


# ════════════════════════════════════════════════════════════════════════════
# 7. Proof chain
# ════════════════════════════════════════════════════════════════════════════
def diag_proof_chain():
    fig, ax = new_fig(10, 8.5)

    ax.text(0.50, 0.975, 'Cryptographic Hash Chain',
            ha='center', va='top', fontsize=15, fontweight='bold',
            color=NAVY, fontfamily=FONT)

    blocks = [
        (GREEN,  'GENESIS',                   '',
         'hash = SHA256(request_id + "genesis")', 'prev_hash = none'),
        (BLUE,   'DELETION_STEP_SUCCEEDED',    'service: cache-cleanup',
         'hash = SHA256(prev_hash + event_type + payload + timestamp)', ''),
        (PURPLE, 'DELETION_STEP_SUCCEEDED',    'service: search-cleanup',
         'hash = SHA256(prev_hash + event_type + payload + timestamp)', ''),
        (AMBER,  'DELETION_STEP_SUCCEEDED',    'service: analytics-cleanup',
         'hash = SHA256(prev_hash + event_type + payload + timestamp)', ''),
    ]

    bh, gap, start = 0.145, 0.055, 0.875
    bx, bw = 0.05, 0.90
    block_boxes = []
    by = start

    for col, title, sub, hash_line, note in blocks:
        rect2 = FancyBboxPatch((bx, by - bh), bw, bh,
                               boxstyle='round,pad=0,rounding_size=0.014',
                               linewidth=2.5, edgecolor=col,
                               facecolor=col + '18', zorder=3)
        ax.add_patch(rect2)
        ax.text(0.50, by - 0.026, title, ha='center', va='center',
                fontsize=12.5, fontweight='bold', color=col, fontfamily=FONT, zorder=4)
        if sub:
            ax.text(0.10, by - 0.058, sub, ha='left', va='center',
                    fontsize=9.5, color=GRAY, fontfamily=FONT, zorder=4)
        ax.text(0.10, by - 0.086, hash_line, ha='left', va='center',
                fontsize=8.8, color=LGRAY, fontfamily=FONT, style='italic', zorder=4)
        if note:
            ax.text(0.10, by - 0.115, note, ha='left', va='center',
                    fontsize=8.8, color=LGRAY, fontfamily=FONT, zorder=4)
        block_boxes.append((bx, by - bh, bw, bh))
        by -= bh + gap

    for i in range(len(block_boxes) - 1):
        b1, b2 = block_boxes[i], block_boxes[i + 1]
        y_top = b1[1]
        y_bot = b2[1] + b2[3]
        col = blocks[i][0]
        ax.annotate('', xy=(0.50, y_bot + 0.004), xytext=(0.50, y_top - 0.004),
                    arrowprops=dict(arrowstyle='->', color=col, lw=3.0,
                                   mutation_scale=16), zorder=5, clip_on=False)
        ax.text(0.56, (y_top + y_bot) / 2, 'prev_hash',
                ha='left', va='center', fontsize=9, color=LGRAY, fontfamily=FONT)

    ax.text(0.50, 0.038,
            "Modifying any field changes that block's hash — breaking all subsequent links",
            ha='center', va='center', fontsize=10.5, color=RED,
            fontweight='bold', fontfamily=FONT)

    save(fig, 'diag_proof_chain.png')


# ════════════════════════════════════════════════════════════════════════════
# 8. Consistency table
# ════════════════════════════════════════════════════════════════════════════
def diag_consistency():
    fig, ax = new_fig(13, 6)

    ax.text(0.50, 0.975, 'Consistency Tradeoffs by Data Store',
            ha='center', va='top', fontsize=14, fontweight='bold',
            color=NAVY, fontfamily=FONT)

    rows = [
        ('PostgreSQL',    'Synchronous ORM',       'Low',    'Strong',   ORANGE),
        ('Redis Cache',   'Async AMQP Event',       'V. Low', 'Eventual', BLUE),
        ('Elasticsearch', 'Async AMQP Event',       'Low',    'Eventual', BLUE),
        ('Analytics DB',  'Soft-delete / Delayed',  'High',   'Eventual', PURPLE),
        ('Backup / S3',   'Scheduled / Async',       'High',   'Eventual', AMBER),
    ]
    headers = ['System', 'Deletion Strategy', 'Latency Impact', 'Consistency']
    col_x = [0.03, 0.22, 0.48, 0.68]

    hr = FancyBboxPatch((0.02, 0.865), 0.96, 0.075,
                        boxstyle='round,pad=0,rounding_size=0.010',
                        linewidth=1, edgecolor=BORDER,
                        facecolor=NAVY + '18', zorder=3)
    ax.add_patch(hr)
    for i, h in enumerate(headers):
        ax.text(col_x[i] + 0.01, 0.902, h, ha='left', va='center',
                fontsize=11, fontweight='bold', color=NAVY, fontfamily=FONT, zorder=4)

    row_h = 0.115
    for r, (sys, strat, lat, cons, col) in enumerate(rows):
        ry = 0.730 - r * row_h
        rrect = FancyBboxPatch((0.02, ry), 0.96, row_h - 0.008,
                               boxstyle='round,pad=0,rounding_size=0.009',
                               linewidth=1.4, edgecolor=col + '55',
                               facecolor=col + '12', zorder=3)
        ax.add_patch(rrect)
        for i, val in enumerate([sys, strat, lat, cons]):
            if i == 0:
                c, bold = col, True
            elif i == 3 and cons == 'Strong':
                c, bold = GREEN, True
            else:
                c, bold = GRAY, False
            ax.text(col_x[i] + 0.01, ry + (row_h - 0.008) / 2, val,
                    ha='left', va='center', fontsize=11,
                    fontweight='bold' if bold else 'normal',
                    color=c, fontfamily=FONT, zorder=4)

        dot_col = GREEN if lat in ('Low', 'V. Low') else RED
        ax.text(0.92, ry + (row_h - 0.008) / 2, lat,
                ha='center', va='center', fontsize=10, fontweight='bold',
                color=dot_col, fontfamily=FONT, zorder=4,
                bbox=dict(boxstyle='round,pad=0.3', fc=dot_col + '22',
                          ec=dot_col, linewidth=1.2))

    ax.text(0.50, 0.035,
            'AP (Availability + Partition Tolerance) for event path  ·  Consistency via proof chain',
            ha='center', va='bottom', fontsize=10, color=LGRAY,
            fontfamily=FONT, style='italic')

    save(fig, 'diag_consistency.png')


# ════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('Generating diagrams...')
    diag_problem()
    diag_solution_flow()
    diag_architecture()
    diag_sequence()
    diag_workflow()
    diag_reliability()
    diag_proof_chain()
    diag_consistency()
    print('Done.')
