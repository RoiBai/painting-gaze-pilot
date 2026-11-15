"""Reproduce lossless scene crops from the preserved full-scroll JPEG; no enhancement.
Optional authoring dependency: Pillow. This is not needed to start the website.
"""
from pathlib import Path
from PIL import Image
import hashlib, json
ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / 'public' / 'materials'
SOURCE = MATERIALS / 'ming-xingle-full.jpg'
CROPS = [('archery', 29200, 0, 6888, 1966), ('cuju', 24100, 0, 5900, 1966)]
SOURCE_URL = 'https://shuge.7rs.net/%E5%8F%A4%E5%9B%BE/%E5%8D%B7%E8%BD%B4%E7%94%BB/%E6%98%8E%E5%AE%A3%E5%AE%97%E8%A1%8C%E4%B9%90%E5%9B%BE%E5%8D%B7.36088X1966%E5%83%8F%E7%B4%A0.%E6%95%85%E5%AE%AB%E5%8D%9A%E7%89%A9%E9%99%A2%E8%97%8F.%E7%BB%A2%E6%9C%AC%E8%AE%BE%E8%89%B2.jpg'
source = Image.open(SOURCE)
assert source.size == (36088, 1966)
source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
records = []
for scene, x, y, w, h in CROPS:
    destination = MATERIALS / f'ming-xingle-{scene}-v2.png'
    crop = source.crop((x, y, x+w, y+h))
    crop.save(destination, optimize=True)
    # Compare decoded pixels with the original selected rectangle.
    assert Image.open(destination).tobytes() == source.crop((x, y, x+w, y+h)).tobytes()
    records.append({'paintingId': f'ming-xingle-{scene}', 'materialVersion': 'ming-scenes-test-2.0', 'runtimeImage': f'/materials/{destination.name}', 'preservedSource': SOURCE.name, 'sourceDimensions': {'width':36088,'height':1966}, 'sourceSha256': source_sha, 'crop': {'x':x,'y':y,'width':w,'height':h}, 'outputDimensions': {'width':w,'height':h}, 'cropSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'imageSource':SOURCE_URL, 'sourceDescription':'书格公开镜像保存的完整长卷；文件名、尺寸与书格原发布说明一致。', 'sourcePage':'https://old.shuge.org/ebook/ming-xuan-zong-xing-le-tu-juan/', 'contentSource':'https://minghuaji.dpm.org.cn/paint/detail?id=9hv8wtoav5a5hyr0l7pmjc765dwesqti', 'retrievedDate':'2026-11-16', 'processing':'全高矩形像素裁切，PNG 无损保存；无缩放、补绘、插值、颜色修改或 AOI 叠加。', 'sharedBoundary':'两裁图在全卷 x=29200..30000 的墙体/树木分隔区域有重叠；没有把它当成独立作品或互斥全卷分割。', 'approvalStatus':'researcher-review-pending'})
    preview = crop.copy(); preview.thumbnail((1800,700)); preview.save(ROOT / 'docs' / f'{scene}-v2-preview.jpg', quality=95)
(MATERIALS/'provenance.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
print('Verified both lossless scene crops against full-scroll pixels.')
