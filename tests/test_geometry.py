import pytest

from paperboard.geometry import area, contains_point, normalise, overlap_ratio, pad


def test_normalise_orders_corners():
    assert normalise((10.0, 20.0, 5.0, 8.0)) == (5.0, 8.0, 10.0, 20.0)


def test_normalise_leaves_a_good_rect_alone():
    assert normalise((1.0, 2.0, 3.0, 4.0)) == (1.0, 2.0, 3.0, 4.0)


def test_pad_grows_every_side():
    assert pad((10.0, 10.0, 20.0, 20.0), 4.0) == (6.0, 6.0, 24.0, 24.0)


def test_contains_point_is_inclusive_on_the_edge():
    assert contains_point((0.0, 0.0, 10.0, 10.0), 0.0, 5.0)
    assert not contains_point((0.0, 0.0, 10.0, 10.0), 10.1, 5.0)


def test_overlap_ratio_is_area_of_intersection_over_inner():
    # inner is half inside outer
    assert overlap_ratio((0.0, 0.0, 10.0, 10.0), (5.0, 0.0, 15.0, 10.0)) == pytest.approx(0.5)


def test_overlap_ratio_is_zero_when_disjoint():
    assert overlap_ratio((0.0, 0.0, 1.0, 1.0), (5.0, 5.0, 6.0, 6.0)) == 0.0


def test_area_of_a_rect():
    assert area((0.0, 0.0, 10.0, 4.0)) == 40.0


def test_overlap_ratio_of_a_degenerate_rect_is_zero_not_a_crash():
    assert overlap_ratio((1.0, 1.0, 1.0, 1.0), (0.0, 0.0, 10.0, 10.0)) == 0.0
