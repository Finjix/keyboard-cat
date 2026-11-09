"""Compatibility entry for the hand-traced contour and original fur-detail workflow."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('add-fur-fringe.py')), run_name='__main__')
