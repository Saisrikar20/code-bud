"""
Fibonacci Program (1 - 7)
Generates the Fibonacci sequence for the first 7 terms:
0, 1, 1, 2, 3, 5, 8  ->  taking terms 1 through 7.

Each number is the sum of the two numbers before it.
"""


def fibonacci(n):
    """Return a list containing the first n Fibonacci numbers."""
    if n <= 0:
        return []
    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])
    return sequence[:n]


def fibonacci_up_to_value(limit):
    """Return Fibonacci numbers whose values fall between 1 and a limit (e.g. 7)."""
    result = []
    a, b = 0, 1
    while a <= limit:
        if a >= 1:
            result.append(a)
        a, b = b, a + b
    return result


if __name__ == "__main__":
    print("=== Fibonacci Sequence: Terms 1 to 7 ===")
    first_seven = fibonacci(7)
    for term in range(1, 8):
        print(f"Term {term}: {first_seven[term - 1]}")

    print("\nFull sequence (first 7 terms):", first_seven)
    print("Sum of first 7 terms:", sum(first_seven))

    print("\n=== Fibonacci numbers with values from 1 to 7 ===")
    print(fibonacci_up_to_value(7))
