#!/usr/bin/env python3
"""Wire book-course routes into server.ts"""
from pathlib import Path
S = Path('/opt/urban-kids-club-v2/packages/provider-dashboard/src/api/server.ts')
src = S.read_text(encoding='utf-8')

# Import
if "from './book-course.service'" not in src:
    src = src.replace(
        "import { handleCancelBooking } from './cancel-booking.service'",
        "import { handleCancelBooking } from './cancel-booking.service'\nimport { handleBookCourse } from './book-course.service'",
    )
    print('OK added import { handleBookCourse }')
else:
    print('- import already present')

# Dispatcher
if 'handleBookCourse(req' not in src:
    dispatch = """  // Parent: book trial / block / redeem credit
  if (path === '/api/parent/book-trial' || path === '/api/parent/book-block' || path === '/api/parent/redeem-credit') {
    const _url = new URL(req.url || '/', 'https://' + (req.headers.host || 'localhost'))
    const handled = await handleBookCourse(req, res, _url, () => null)
    if (handled) return
  }

"""
    anchor = '  // Parent: cancel booking (24h grace period)'
    src = src.replace(anchor, dispatch + anchor, 1)
    print('OK added book-course dispatcher')
else:
    print('- dispatcher already present')

S.write_text(src, encoding='utf-8')
print(f'\nOK server.ts updated ({len(src)} bytes)')
